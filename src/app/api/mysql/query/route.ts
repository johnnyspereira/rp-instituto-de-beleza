import type { ResultSetHeader, RowDataPacket } from 'mysql2';

import { getSession } from '@/lib/auth/session';
import { getAuthContext } from '@/lib/auth/service';
import { db } from '@/lib/mysql/db';
import { compileQuery } from '@/lib/mysql/query-compiler';
import { getTablePolicy, roleAllows } from '@/lib/mysql/table-policy';
import { hydrateRelationships } from '@/lib/mysql/relations';
import type {
  MysqlQueryRequest,
  MysqlQueryResponse,
} from '@/lib/mysql/query-types';

export const runtime = 'nodejs';

function errorResponse(message: string, status: number, code?: string) {
  return Response.json(
    {
      data: null,
      error: { message, code },
      count: null,
      status,
      statusText: message,
    } satisfies MysqlQueryResponse,
    { status }
  );
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return errorResponse('Unauthorized', 401, 'AUTH_REQUIRED');
  const auth = await getAuthContext(session.user.id);
  if (!auth)
    return errorResponse('Account context not found.', 403, 'ACCOUNT_REQUIRED');

  const query = (await request
    .json()
    .catch(() => null)) as MysqlQueryRequest | null;
  if (
    !query ||
    typeof query.table !== 'string' ||
    typeof query.operation !== 'string'
  ) {
    return errorResponse('Invalid query request.', 400, 'INVALID_QUERY');
  }

  const policy = getTablePolicy(query.table);
  if (!policy)
    return errorResponse('Table is not available.', 403, 'TABLE_FORBIDDEN');
  if (
    query.operation !== 'select' &&
    !roleAllows(auth.profile.account_role, policy.minimumWriteRole ?? 'agent')
  ) {
    return errorResponse('Insufficient permissions.', 403, 'ROLE_REQUIRED');
  }

  try {
    const compiled = compileQuery(query, {
      accountId: auth.account.id,
      userId: auth.user.id,
    });

    if (compiled.operation === 'select') {
      const [rows] = await db().execute<RowDataPacket[]>(
        compiled.sql,
        compiled.values
      );
      await hydrateRelationships(query.table, query.columns, rows);
      let count: number | null = null;
      if (query.count) {
        const countQuery = compileQuery(
          { ...query, columns: 'id', limit: undefined, offset: undefined, head: false, single: undefined, orders: undefined },
          { accountId: auth.account.id, userId: auth.user.id }
        );
        const [countRows] = await db().execute<RowDataPacket[]>(countQuery.sql, countQuery.values);
        count = countRows.length;
      }
      if (query.head) {
        return Response.json({
          data: null,
          error: null,
          count,
          status: 200,
          statusText: 'OK',
        });
      }
      if (query.single === 'single' && rows.length !== 1) {
        return errorResponse('Expected exactly one row.', 406, 'PGRST116');
      }
      const data = query.single ? (rows[0] ?? null) : rows;
      return Response.json({
        data,
        error: null,
        count,
        status: 200,
        statusText: 'OK',
      });
    }

    const [result] = await db().execute<ResultSetHeader>(
      compiled.sql,
      compiled.values
    );
    let data: unknown = null;
    if (query.columns && compiled.insertedIds?.length) {
      const followup = compileQuery(
        {
          table: query.table,
          operation: 'select',
          columns: query.columns,
          filters: [{ column: 'id', operator: 'in', value: compiled.insertedIds }],
          single: query.single,
        },
        { accountId: auth.account.id, userId: auth.user.id }
      );
      const [rows] = await db().execute<RowDataPacket[]>(
        followup.sql,
        followup.values
      );
      await hydrateRelationships(query.table, query.columns, rows);
      data = query.single ? (rows[0] ?? null) : rows;
    } else if (
      query.columns &&
      query.operation === 'update' &&
      result.affectedRows > 0
    ) {
      const followup = compileQuery(
        {
          table: query.table,
          operation: 'select',
          columns: query.columns,
          filters: query.filters,
          single: query.single,
          limit: query.limit,
        },
        { accountId: auth.account.id, userId: auth.user.id }
      );
      const [rows] = await db().execute<RowDataPacket[]>(
        followup.sql,
        followup.values
      );
      await hydrateRelationships(query.table, query.columns, rows);
      if (query.single === 'single' && rows.length !== 1) {
        return errorResponse('Expected exactly one row.', 406, 'PGRST116');
      }
      data = query.single ? (rows[0] ?? null) : rows;
    }
    return Response.json({
      data,
      error: null,
      count: query.count ? result.affectedRows : null,
      status: 200,
      statusText: 'OK',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'MySQL query failed.';
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : 'MYSQL_QUERY_FAILED';
    console.error('[mysql-query]', {
      table: query.table,
      operation: query.operation,
      code,
    });
    return errorResponse(message, 400, code);
  }
}
