'use client';

import type {
  MysqlOperation,
  MysqlQueryRequest,
  MysqlQueryResponse,
  QueryFilter,
} from '@/lib/mysql/query-types';

class BrowserQueryBuilder<T = unknown> implements PromiseLike<
  MysqlQueryResponse<T>
> {
  private request: MysqlQueryRequest;

  constructor(table: string) {
    this.request = { table, operation: 'select', columns: '*' };
  }

  select(
    columns = '*',
    options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }
  ) {
    this.request.columns = columns;
    this.request.count = options?.count;
    this.request.head = options?.head;
    return this;
  }

  insert(
    values: Record<string, unknown> | Record<string, unknown>[],
    options?: { count?: 'exact' }
  ) {
    return this.mutation('insert', values, options);
  }

  upsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    options?: {
      onConflict?: string;
      ignoreDuplicates?: boolean;
      count?: 'exact';
    }
  ) {
    this.mutation('upsert', values, options);
    this.request.onConflict = options?.onConflict;
    this.request.ignoreDuplicates = options?.ignoreDuplicates;
    return this;
  }

  update(values: Record<string, unknown>, options?: { count?: 'exact' }) {
    return this.mutation('update', values, options);
  }

  delete(options?: { count?: 'exact' }) {
    this.request.operation = 'delete';
    this.request.count = options?.count;
    return this;
  }

  eq(column: string, value: unknown) {
    return this.filter(column, 'eq', value);
  }
  neq(column: string, value: unknown) {
    return this.filter(column, 'neq', value);
  }
  gt(column: string, value: unknown) {
    return this.filter(column, 'gt', value);
  }
  gte(column: string, value: unknown) {
    return this.filter(column, 'gte', value);
  }
  lt(column: string, value: unknown) {
    return this.filter(column, 'lt', value);
  }
  lte(column: string, value: unknown) {
    return this.filter(column, 'lte', value);
  }
  like(column: string, value: unknown) {
    return this.filter(column, 'like', value);
  }
  ilike(column: string, value: unknown) {
    return this.filter(column, 'ilike', value);
  }
  in(column: string, value: unknown[]) {
    return this.filter(column, 'in', value);
  }
  is(column: string, value: null | boolean) {
    return this.filter(column, 'is', value);
  }

  not(column: string, operator: string, value: unknown) {
    if (operator === 'is') return this.filter(column, 'not_is', value);
    if (operator === 'eq') return this.filter(column, 'neq', value);
    throw new Error(`Unsupported local filter: not.${operator}`);
  }

  contains(column: string, value: unknown) {
    return this.filter(column, 'contains', value);
  }

  or(expression: string) {
    this.request.or = expression;
    return this;
  }

  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean }
  ) {
    this.request.orders = [
      ...(this.request.orders ?? []),
      { column, ascending: options?.ascending },
    ];
    return this;
  }

  limit(value: number) {
    this.request.limit = value;
    return this;
  }

  range(from: number, to: number) {
    this.request.offset = from;
    this.request.limit = Math.max(0, to - from + 1);
    return this;
  }

  single() {
    this.request.single = 'single';
    return this;
  }

  maybeSingle() {
    this.request.single = 'maybeSingle';
    return this;
  }

  then<TResult1 = MysqlQueryResponse<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: MysqlQueryResponse<T>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private mutation(
    operation: MysqlOperation,
    values: Record<string, unknown> | Record<string, unknown>[],
    options?: { count?: 'exact' }
  ) {
    this.request.operation = operation;
    this.request.values = values;
    this.request.count = options?.count;
    delete this.request.columns;
    return this;
  }

  private filter(
    column: string,
    operator: QueryFilter['operator'],
    value: unknown
  ) {
    this.request.filters = [
      ...(this.request.filters ?? []),
      { column, operator, value },
    ];
    return this;
  }

  private async execute(): Promise<MysqlQueryResponse<T>> {
    try {
      const response = await fetch('/api/mysql/query', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.request),
      });
      const raw = await response.text();
      const contentType = response.headers.get('content-type') ?? '';

      if (contentType.includes('application/json')) {
        return JSON.parse(raw) as MysqlQueryResponse<T>;
      }

      // Passenger/cPanel error pages are HTML. Returning a standard query
      // error keeps the form usable and avoids the misleading JSON parser
      // message "Unexpected token '<'" in every CRM screen.
      const status = response.status || 502;
      const detail = status === 508
        ? 'O alojamento atingiu o limite de recursos (508).'
        : `O servidor respondeu HTTP ${status}.`;
      return {
        data: null,
        error: { message: `${detail} Tente novamente após reiniciar a aplicação.`, code: `HTTP_${status}` },
        count: null,
        status,
        statusText: response.statusText || 'Server error',
      } as MysqlQueryResponse<T>;
    } catch (error) {
      return {
        data: null,
        error: {
          message: `Não foi possível contactar o servidor: ${error instanceof Error ? error.message : 'erro de rede.'}`,
          code: 'NETWORK_ERROR',
        },
        count: null,
        status: 503,
        statusText: 'Network error',
      } as MysqlQueryResponse<T>;
    }
  }
}

type ChangeHandler = {
  config: { event?: string; table: string; filter?: string };
  callback: (payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: Record<string, unknown>; old: Record<string, unknown> }) => void;
  rows: Map<string, Record<string, unknown>> | null;
};

class LocalPollingChannel {
  private handlers: ChangeHandler[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(readonly name: string) {}
  on(_kind: string, config: ChangeHandler['config'], callback: ChangeHandler['callback']) {
    this.handlers.push({ config, callback, rows: null });
    return this;
  }
  subscribe(callback?: (status: string) => void) {
    void this.poll();
    this.timer = setInterval(() => void this.poll(), 4000);
    callback?.('SUBSCRIBED');
    return this;
  }
  unsubscribe() { if (this.timer) clearInterval(this.timer); this.timer = null; return Promise.resolve('ok'); }
  private async poll() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    await Promise.all(this.handlers.map(async (handler) => {
      let query = new BrowserQueryBuilder<Record<string, unknown>>(handler.config.table).select('*').limit(500);
      const filter = handler.config.filter?.match(/^([A-Za-z_][A-Za-z0-9_]*)=eq\.(.+)$/);
      if (filter) query = query.eq(filter[1], filter[2]);
      const response = await query;
      if (response.error || !Array.isArray(response.data)) return;
      const next = new Map(response.data.map((row) => [String(row.id), row]));
      if (handler.rows) {
        for (const [id, row] of next) {
          const previous = handler.rows.get(id);
          const eventType = previous ? 'UPDATE' : 'INSERT';
          if ((!previous || JSON.stringify(previous) !== JSON.stringify(row)) && (handler.config.event === '*' || handler.config.event === eventType)) {
            handler.callback({ eventType, new: row, old: previous ?? {} });
          }
        }
        for (const [id, row] of handler.rows) if (!next.has(id) && (handler.config.event === '*' || handler.config.event === 'DELETE')) {
          handler.callback({ eventType: 'DELETE', new: {}, old: row });
        }
      }
      handler.rows = next;
    }));
  }
}

export function createMysqlBrowserClient() {
  const channels = new Set<LocalPollingChannel>();
  const auth = {
    async getSession() {
      const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
      const payload = await response.json();
      return { data: { session: payload.session ?? null }, error: payload.error ?? null };
    },
    async getUser() {
      const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
      const payload = await response.json();
      return { data: { user: payload.session?.user ?? null }, error: payload.error ?? null };
    },
    async signInWithPassword(credentials: { email: string; password: string }) {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
      const payload = await response.json();
      return { data: { session: payload.session ?? null, user: payload.session?.user ?? null }, error: response.ok ? null : (payload.error ?? { message: 'Login failed.' }) };
    },
    async signOut() {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      return { error: response.ok ? null : { message: 'Logout failed.' } };
    },
    async updateUser(attributes: Record<string, unknown>) {
      const response = await fetch('/api/auth/user', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attributes) });
      const payload = await response.json();
      return { data: payload.data ?? {}, error: response.ok ? null : (payload.error ?? { message: 'Update failed.' }) };
    },
    async resetPasswordForEmail(email: string, options?: { redirectTo?: string }) {
      const response = await fetch('/api/auth/password/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, redirectTo: options?.redirectTo }) });
      const payload = await response.json();
      return { data: payload.data ?? {}, error: response.ok ? null : (payload.error ?? { message: 'Request failed.' }) };
    },
  };

  return {
    auth,
    storage: {
      from(bucket: string) { return {
        async upload(path: string, file: Blob, options?: { upsert?: boolean }) { const form = new FormData(); form.set('path', path); form.set('file', file); form.set('upsert', String(Boolean(options?.upsert))); const response = await fetch(`/api/storage/${encodeURIComponent(bucket)}`, { method: 'POST', body: form }); return response.json(); },
        async remove(paths: string[]) { const response = await fetch(`/api/storage/${encodeURIComponent(bucket)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths }) }); return response.json(); },
        getPublicUrl(path: string) { return { data: { publicUrl: `/uploads/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}` } }; },
      }; },
    },
    from<T = unknown>(table: string) {
      return new BrowserQueryBuilder<T>(table);
    },
    async rpc(name: string, args: Record<string, unknown> = {}) {
      const response = await fetch('/api/mysql/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, args }) });
      return response.json();
    },
    channel(name: string) { const channel = new LocalPollingChannel(name); channels.add(channel); return channel; },
    async removeChannel(channel: LocalPollingChannel) { channels.delete(channel); return channel.unsubscribe(); },
  };
}
