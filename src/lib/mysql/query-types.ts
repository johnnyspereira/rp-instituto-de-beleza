export type MysqlOperation =
  'select' | 'insert' | 'upsert' | 'update' | 'delete';

export type FilterOperator =
  'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'is' | 'not_is' | 'contains';

export interface QueryFilter {
  column: string;
  operator: FilterOperator;
  value: unknown;
}

export interface QueryOrder {
  column: string;
  ascending?: boolean;
}

export interface MysqlQueryRequest {
  table: string;
  operation: MysqlOperation;
  columns?: string;
  values?: Record<string, unknown> | Record<string, unknown>[];
  filters?: QueryFilter[];
  orders?: QueryOrder[];
  limit?: number;
  offset?: number;
  count?: 'exact' | 'planned' | 'estimated';
  head?: boolean;
  single?: 'single' | 'maybeSingle';
  onConflict?: string;
  ignoreDuplicates?: boolean;
  or?: string;
}

export interface MysqlQueryResponse<T = unknown> {
  data: T | null;
  error: {
    message: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null;
  count: number | null;
  status: number;
  statusText: string;
}
