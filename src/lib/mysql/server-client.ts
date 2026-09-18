import 'server-only';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { ExecuteValues, ResultSetHeader, RowDataPacket } from 'mysql2';

import { getSession } from '@/lib/auth/session';
import { getAuthContext } from '@/lib/auth/service';
import { hashPassword } from '@/lib/auth/password';
import { db, mutate, selectRows } from '@/lib/mysql/db';
import { compileQuery } from '@/lib/mysql/query-compiler';
import { createLocalServerStorage } from '@/lib/storage/local-storage';
import { hydrateRelationships } from '@/lib/mysql/relations';
import type { MysqlOperation, MysqlQueryRequest, MysqlQueryResponse, QueryFilter } from '@/lib/mysql/query-types';

type Context = { accountId: string; userId: string; bypassTenant?: boolean };

class ServerQueryBuilder<T = unknown> implements PromiseLike<MysqlQueryResponse<T>> {
  private request: MysqlQueryRequest;
  constructor(private readonly context: () => Promise<Context>, table: string) {
    this.request = { table, operation: 'select', columns: '*' };
  }
  select(columns = '*', options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) { this.request.columns = columns; this.request.count = options?.count; this.request.head = options?.head; return this; }
  insert(values: Record<string, unknown> | Record<string, unknown>[], options?: { count?: 'exact' }) { return this.mutation('insert', values, options); }
  upsert(values: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string; ignoreDuplicates?: boolean; count?: 'exact' }) { this.mutation('upsert', values, options); this.request.onConflict = options?.onConflict; this.request.ignoreDuplicates = options?.ignoreDuplicates; return this; }
  update(values: Record<string, unknown>, options?: { count?: 'exact' }) { return this.mutation('update', values, options); }
  delete(options?: { count?: 'exact' }) { this.request.operation = 'delete'; this.request.count = options?.count; return this; }
  eq(c: string, v: unknown) { return this.filter(c, 'eq', v); } neq(c: string, v: unknown) { return this.filter(c, 'neq', v); }
  gt(c: string, v: unknown) { return this.filter(c, 'gt', v); } gte(c: string, v: unknown) { return this.filter(c, 'gte', v); }
  lt(c: string, v: unknown) { return this.filter(c, 'lt', v); } lte(c: string, v: unknown) { return this.filter(c, 'lte', v); }
  like(c: string, v: unknown) { return this.filter(c, 'like', v); } ilike(c: string, v: unknown) { return this.filter(c, 'ilike', v); }
  in(c: string, v: unknown[]) { return this.filter(c, 'in', v); } is(c: string, v: null | boolean) { return this.filter(c, 'is', v); }
  not(c: string, operator: string, v: unknown) { return this.filter(c, operator === 'is' ? 'not_is' : 'neq', v); }
  contains(c: string, v: unknown) { return this.filter(c, 'contains', v); }
  or(value: string) { this.request.or = value; return this; }
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) { this.request.orders = [...(this.request.orders ?? []), { column, ascending: options?.ascending }]; return this; }
  limit(value: number) { this.request.limit = value; return this; }
  range(from: number, to: number) { this.request.offset = from; this.request.limit = Math.max(0, to - from + 1); return this; }
  single() { this.request.single = 'single'; return this; } maybeSingle() { this.request.single = 'maybeSingle'; return this; }
  then<A = MysqlQueryResponse<T>, B = never>(ok?: ((value: MysqlQueryResponse<T>) => A | PromiseLike<A>) | null, fail?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> { return this.execute().then(ok, fail); }
  private mutation(operation: MysqlOperation, values: Record<string, unknown> | Record<string, unknown>[], options?: { count?: 'exact' }) { this.request.operation = operation; this.request.values = values; this.request.count = options?.count; return this; }
  private filter(column: string, operator: QueryFilter['operator'], value: unknown) { this.request.filters = [...(this.request.filters ?? []), { column, operator, value }]; return this; }
  private async execute(): Promise<MysqlQueryResponse<T>> {
    try {
      const compiled = compileQuery(this.request, await this.context());
      if (compiled.operation === 'select') {
        const [rows] = await db().execute<RowDataPacket[]>(compiled.sql, compiled.values);
        await hydrateRelationships(this.request.table, this.request.columns, rows);
        if (this.request.single === 'single' && rows.length !== 1) return result<T>(null, { message: 'Expected exactly one row.', code: 'PGRST116' }, null, 406);
        const data = (this.request.single ? (rows[0] ?? null) : rows) as T;
        let count: number | null = null;
        if (this.request.count) {
          const countQuery = compileQuery({ ...this.request, columns: 'id', limit: undefined, offset: undefined, head: false, single: undefined, orders: undefined }, await this.context());
          const [countRows] = await db().execute<RowDataPacket[]>(countQuery.sql, countQuery.values);
          count = countRows.length;
        }
        return result(this.request.head ? null : data, null, count);
      }
      const [header] = await db().execute<ResultSetHeader>(compiled.sql, compiled.values);
      let data: unknown = null;
      if (this.request.columns && compiled.insertedIds?.length) {
        const followup: MysqlQueryRequest = { table: this.request.table, operation: 'select', columns: this.request.columns, filters: [{ column: 'id', operator: 'in', value: compiled.insertedIds }], single: this.request.single };
        const selected = compileQuery(followup, await this.context());
        const [rows] = await db().execute<RowDataPacket[]>(selected.sql, selected.values);
        await hydrateRelationships(this.request.table, this.request.columns, rows);
        data = this.request.single ? (rows[0] ?? null) : rows;
      }
      return result(data as T, null, this.request.count ? header.affectedRows : null);
    } catch (cause) { return result<T>(null, { message: cause instanceof Error ? cause.message : 'MySQL query failed.', code: 'MYSQL_QUERY_FAILED' }, null, 400); }
  }
}

function result<T>(data: T | null, error: MysqlQueryResponse['error'], count: number | null, status = 200): MysqlQueryResponse<T> { return { data, error, count, status, statusText: error?.message ?? 'OK' }; }

async function sessionContext(): Promise<Context> {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');
  const auth = await getAuthContext(session.user.id);
  if (!auth) throw new Error('Account context not found.');
  return { accountId: auth.account.id, userId: auth.user.id };
}

export function createMysqlServerClient(context: () => Promise<Context> = sessionContext) {
  return {
    storage: createLocalServerStorage(),
    from<T = unknown>(table: string) { return new ServerQueryBuilder<T>(context, table); },
    async rpc(name: string, args: Record<string, unknown> = {}) {
      const { executeMysqlRpc } = await import('@/lib/mysql/rpc');
      return executeMysqlRpc(name, args, await context());
    },
    auth: {
      async getUser() { const session = await getSession(); const auth = session ? await getAuthContext(session.user.id) : null; return { data: { user: auth?.user ?? null }, error: null }; },
      async getSession() { const session = await getSession(); const auth = session ? await getAuthContext(session.user.id) : null; return { data: { session: auth ? { ...auth, expiresAt: session?.expiresAt } : null }, error: null }; },
    },
  };
}

/** Trusted worker/webhook client. Callers must scope queries explicitly. */
export function createMysqlAdminClient() {
  const client = createMysqlServerClient(async () => ({ accountId: '', userId: '', bypassTenant: true }));
  return {
    ...client,
    auth: {
      ...client.auth,
      admin: {
        async getUserById(id: string) {
          const rows = await selectRows<(RowDataPacket & { id: string; email: string; user_metadata: string | Record<string, unknown> | null })[]>('SELECT id,email,user_metadata FROM app_users WHERE id=? LIMIT 1', [id]);
          return { data: { user: normalizeAdminUser(rows[0]) }, error: null };
        },
        async createUser(input: { email: string; password: string; email_confirm?: boolean; user_metadata?: Record<string, unknown> }) {
          try {
            const id = randomUUID();
            await mutate('INSERT INTO app_users(id,email,password_hash,user_metadata,email_verified_at) VALUES(?,?,?,?,?)', [id, input.email.toLowerCase(), await hashPassword(input.password), JSON.stringify(input.user_metadata ?? {}), input.email_confirm ? new Date() : null]);
            return { data: { user: { id, email: input.email.toLowerCase(), user_metadata: input.user_metadata ?? {} } }, error: null };
          } catch (cause) { return { data: { user: null }, error: { message: cause instanceof Error ? cause.message : 'User creation failed.' } }; }
        },
        async updateUserById(id: string, input: { password?: string; email?: string; user_metadata?: Record<string, unknown> }) {
          try {
            const assignments: string[] = []; const values: unknown[] = [];
            if (input.password) { assignments.push('password_hash=?'); values.push(await hashPassword(input.password)); }
            if (input.email) { assignments.push('email=?'); values.push(input.email.toLowerCase()); }
            if (input.user_metadata) { assignments.push('user_metadata=?'); values.push(JSON.stringify(input.user_metadata)); }
            if (assignments.length) { values.push(id); await mutate(`UPDATE app_users SET ${assignments.join(',')} WHERE id=?`, values as ExecuteValues[]); }
            return { data: { user: { id } }, error: null };
          } catch (cause) { return { data: { user: null }, error: { message: cause instanceof Error ? cause.message : 'User update failed.' } }; }
        },
        async deleteUser(id: string) { try { await mutate('DELETE FROM app_users WHERE id=?', [id]); return { data: {}, error: null }; } catch (cause) { return { data: {}, error: { message: cause instanceof Error ? cause.message : 'User deletion failed.' } }; } },
        async generateLink(input: { type: string; email: string }) {
          const rows = await selectRows<(RowDataPacket & { id: string })[]>('SELECT id FROM app_users WHERE email=? LIMIT 1', [input.email.toLowerCase()]);
          if (!rows[0]) return { data: { properties: null }, error: { message: 'User not found.' } };
          const token = randomBytes(32).toString('base64url');
          await mutate('INSERT INTO app_one_time_tokens(id,user_id,token_hash,purpose,expires_at) VALUES(?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 MINUTE))', [randomUUID(), rows[0].id, createHash('sha256').update(token).digest('hex'), input.type]);
          return { data: { properties: { hashed_token: token } }, error: null };
        },
      },
    },
  };
}

function normalizeAdminUser(row?: RowDataPacket & { id: string; email: string; user_metadata: string | Record<string, unknown> | null }) {
  if (!row) return null;
  let metadata: Record<string, unknown> = {};
  if (typeof row.user_metadata === 'string') { try { metadata = JSON.parse(row.user_metadata); } catch { metadata = {}; } }
  else if (row.user_metadata) metadata = row.user_metadata;
  return { id: row.id, email: row.email, user_metadata: metadata };
}
