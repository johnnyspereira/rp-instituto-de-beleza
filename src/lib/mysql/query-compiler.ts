import { randomUUID } from 'node:crypto';

import type { ExecuteValues } from 'mysql2';

import { getTablePolicy } from '@/lib/mysql/table-policy';
import type { MysqlQueryRequest, QueryFilter } from '@/lib/mysql/query-types';
import { normalizePhone } from '@/lib/whatsapp/phone-utils';

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TABLES_WITHOUT_ID = new Set([
  'clinic_communication_settings',
  'member_presence',
  'client_portal_settings',
  'public_site_settings',
  'referral_program_settings',
  'finance_reminder_settings',
]);

export interface CompiledQuery {
  sql: string;
  values: ExecuteValues[];
  operation: MysqlQueryRequest['operation'];
  insertedIds?: string[];
}

function identifier(value: string): string {
  if (!identifierPattern.test(value))
    throw new Error(`Invalid identifier: ${value}`);
  return `\`${value}\``;
}

function selection(columns = '*'): string {
  if (columns.trim() === '*') return '*';
  // Relationship projections are hydrated by compatibility endpoints. The
  // SQL layer must still return the base row instead of treating PostgREST's
  // nested syntax as an identifier.
  if (columns.includes('(') || columns.includes(')')) return '*';
  return columns
    .split(',')
    .map((item) => {
      const part = item.trim();
      if (part === '*') return '*';
      if (!part) throw new Error('Invalid empty selection.');
      const [alias, column] = part.includes(':')
        ? part.split(':', 2)
        : [null, part];
      return alias
        ? `${identifier(column.trim())} AS ${identifier(alias.trim())}`
        : identifier(column.trim());
    })
    .join(', ');
}

function normalizeValue(value: unknown): ExecuteValues {
  if (value === undefined) return null;
  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  ) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (
    Array.isArray(value) ||
    (typeof value === 'object' && value !== null && !(value instanceof Date))
  ) {
    return JSON.stringify(value);
  }
  return value as ExecuteValues;
}

function compileFilter(filter: QueryFilter, values: ExecuteValues[]): string {
  const column = identifier(filter.column);
  if (filter.operator === 'not_is') {
    if (filter.value === null) return `${column} IS NOT NULL`;
    if (filter.value === true) return `${column} IS NOT TRUE`;
    if (filter.value === false) return `${column} IS NOT FALSE`;
    throw new Error('The not-is filter accepts only null or boolean values.');
  }
  if (filter.operator === 'contains') {
    values.push(JSON.stringify(filter.value));
    return `JSON_CONTAINS(${column}, ?)`;
  }
  if (filter.operator === 'is') {
    if (filter.value === null) return `${column} IS NULL`;
    if (filter.value === true) return `${column} IS TRUE`;
    if (filter.value === false) return `${column} IS FALSE`;
    throw new Error('The is filter accepts only null or boolean values.');
  }
  if (filter.operator === 'in') {
    if (!Array.isArray(filter.value) || filter.value.length === 0)
      return 'FALSE';
    values.push(...filter.value.map(normalizeValue));
    return `${column} IN (${filter.value.map(() => '?').join(', ')})`;
  }
  const operators = {
    eq: '=',
    neq: '<>',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
    like: 'LIKE',
    ilike: 'LIKE',
  } as const;
  values.push(normalizeValue(filter.value));
  return filter.operator === 'ilike'
    ? `LOWER(${column}) LIKE LOWER(?)`
    : `${column} ${operators[filter.operator]} ?`;
}

function tenantPredicate(
  table: string,
  accountId: string,
  values: ExecuteValues[]
): string {
  const policy = getTablePolicy(table);
  if (!policy)
    throw new Error(
      `Table is not available through the authenticated API: ${table}`
    );
  values.push(accountId);
  if (policy.accountColumn) return `${identifier(policy.accountColumn)} = ?`;
  if (policy.parent) {
    const parentPolicy = getTablePolicy(policy.parent.parentTable);
    if (!parentPolicy?.accountColumn)
      throw new Error(`Invalid parent policy for ${table}.`);
    const parentAlias = `tenant_${policy.parent.parentTable}`;
    return `EXISTS (SELECT 1 FROM ${identifier(policy.parent.parentTable)} ${identifier(parentAlias)} WHERE ${identifier(parentAlias)}.${identifier(policy.parent.parentColumn ?? 'id')} = ${identifier(table)}.${identifier(policy.parent.localColumn)} AND ${identifier(parentAlias)}.${identifier(parentPolicy.accountColumn)} = ?)`;
  }
  throw new Error(`Missing tenant policy for ${table}.`);
}

function whereClause(
  request: MysqlQueryRequest,
  accountId: string,
  values: ExecuteValues[],
  bypassTenant = false
): string {
  const clauses = bypassTenant
    ? []
    : [tenantPredicate(request.table, accountId, values)];
  for (const filter of request.filters ?? [])
    clauses.push(compileFilter(filter, values));
  if (request.or) clauses.push(compileOrExpression(request.or, values));
  return clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
}

function compileOrExpression(
  expression: string,
  values: ExecuteValues[]
): string {
  const terms = expression
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean);
  if (!terms.length) throw new Error('Empty OR expression.');
  const compiled = terms.map((term) => {
    const [column, operator, ...raw] = term.split('.');
    if (!column || !operator || raw.length === 0)
      throw new Error('Invalid OR expression.');
    const value = raw.join('.');
    const supported: Record<string, QueryFilter['operator']> = {
      eq: 'eq',
      neq: 'neq',
      gt: 'gt',
      gte: 'gte',
      lt: 'lt',
      lte: 'lte',
      like: 'like',
      ilike: 'ilike',
      is: 'is',
    };
    const mapped = supported[operator];
    if (!mapped) throw new Error(`Unsupported OR operator: ${operator}`);
    const normalized = operator === 'is' && value === 'null' ? null : value;
    return compileFilter(
      { column, operator: mapped, value: normalized },
      values
    );
  });
  return `(${compiled.join(' OR ')})`;
}

function rowsWithOwnership(
  request: MysqlQueryRequest,
  accountId: string,
  userId: string,
  bypassTenant = false
): Record<string, unknown>[] {
  const policy = getTablePolicy(request.table);
  if (!policy) throw new Error(`Table is not available: ${request.table}`);
  const source = Array.isArray(request.values)
    ? request.values
    : [request.values ?? {}];
  return source.map((value) => ({
    ...value,
    ...(request.table === 'contacts' && typeof value.phone === 'string'
      ? { phone_normalized: normalizePhone(value.phone) }
      : {}),
    ...(!TABLES_WITHOUT_ID.has(request.table)
      ? { id: value.id ?? randomUUID() }
      : {}),
    ...(!bypassTenant && policy.accountColumn && policy.accountColumn !== 'id'
      ? { [policy.accountColumn]: accountId }
      : {}),
    ...(!bypassTenant && policy.userColumn
      ? { [policy.userColumn]: userId }
      : {}),
  }));
}

export function compileQuery(
  request: MysqlQueryRequest,
  context: { accountId: string; userId: string; bypassTenant?: boolean }
): CompiledQuery {
  const table = identifier(request.table);
  const values: ExecuteValues[] = [];

  if (request.operation === 'select') {
    let sql = `SELECT ${selection(request.columns)} FROM ${table}`;
    sql += whereClause(
      request,
      context.accountId,
      values,
      context.bypassTenant
    );
    if (request.orders?.length) {
      sql += ` ORDER BY ${request.orders
        .map(
          (order) =>
            `${identifier(order.column)} ${order.ascending === false ? 'DESC' : 'ASC'}`
        )
        .join(', ')}`;
    }
    if (request.limit !== undefined) {
      sql += ' LIMIT ?';
      values.push(Math.max(0, Math.min(request.limit, 1000)));
      if (request.offset) {
        sql += ' OFFSET ?';
        values.push(Math.max(0, request.offset));
      }
    }
    return { sql, values, operation: request.operation };
  }

  if (request.operation === 'delete') {
    return {
      sql: `DELETE FROM ${table}${whereClause(request, context.accountId, values, context.bypassTenant)}`,
      values,
      operation: request.operation,
    };
  }

  if (request.operation === 'update') {
    const sourceRow = Array.isArray(request.values)
      ? request.values[0]
      : request.values;
    const row =
      request.table === 'contacts' && typeof sourceRow?.phone === 'string'
        ? { ...sourceRow, phone_normalized: normalizePhone(sourceRow.phone) }
        : sourceRow;
    if (!row || Object.keys(row).length === 0)
      throw new Error('Update values are required.');
    const policy = getTablePolicy(request.table);
    const entries = Object.entries(row).filter(
      ([column]) =>
        column !== policy?.accountColumn &&
        column !== policy?.userColumn &&
        column !== 'id'
    );
    if (!entries.length) throw new Error('No writable values were provided.');
    values.push(...entries.map(([, value]) => normalizeValue(value)));
    const assignments = entries
      .map(([column]) => `${identifier(column)} = ?`)
      .join(', ');
    return {
      sql: `UPDATE ${table} SET ${assignments}${whereClause(request, context.accountId, values, context.bypassTenant)}`,
      values,
      operation: request.operation,
    };
  }

  const rows = rowsWithOwnership(
    request,
    context.accountId,
    context.userId,
    context.bypassTenant
  );
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (!columns.length) throw new Error('Insert values are required.');
  for (const row of rows) {
    for (const column of columns) values.push(normalizeValue(row[column]));
  }
  let sql = `INSERT INTO ${table} (${columns.map(identifier).join(', ')}) VALUES ${rows
    .map(() => `(${columns.map(() => '?').join(', ')})`)
    .join(', ')}`;
  if (request.operation === 'upsert') {
    const updateColumns = columns.filter(
      (column) =>
        column !== 'id' && column !== 'account_id' && column !== 'user_id'
    );
    if (request.ignoreDuplicates) {
      const unchangedColumn = columns[0];
      sql += ` ON DUPLICATE KEY UPDATE ${identifier(unchangedColumn)} = ${identifier(unchangedColumn)}`;
    } else if (updateColumns.length) {
      sql += ` ON DUPLICATE KEY UPDATE ${updateColumns
        .map(
          (column) => `${identifier(column)} = VALUES(${identifier(column)})`
        )
        .join(', ')}`;
    }
  }
  return {
    sql,
    values,
    operation: request.operation,
    insertedIds: rows.flatMap((row) =>
      row.id == null ? [] : [String(row.id)]
    ),
  };
}
