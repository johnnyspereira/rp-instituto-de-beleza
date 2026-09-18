import { describe, expect, it } from 'vitest';

import { isMissingSchemaError } from '@/lib/mysql/schema-errors';

describe('data cleanup schema compatibility', () => {
  it('accepts missing PostgreSQL schema objects', () => {
    expect(isMissingSchemaError({ code: '42P01' })).toBe(true);
    expect(isMissingSchemaError({ code: '42703' })).toBe(true);
  });

  it('accepts missing MySQL tables and columns', () => {
    expect(isMissingSchemaError({ code: 'ER_NO_SUCH_TABLE' })).toBe(true);
    expect(isMissingSchemaError({ code: 'ER_BAD_FIELD_ERROR' })).toBe(true);
    expect(
      isMissingSchemaError({
        code: 'MYSQL_QUERY_FAILED',
        message: "Table 'crm.optional_table' doesn't exist",
      })
    ).toBe(true);
    expect(
      isMissingSchemaError({ message: "Unknown column 'id' in 'field list'" })
    ).toBe(true);
  });

  it('does not hide foreign-key or connection failures', () => {
    expect(isMissingSchemaError({ code: 'ER_ROW_IS_REFERENCED_2' })).toBe(
      false
    );
    expect(isMissingSchemaError({ message: 'Connection lost' })).toBe(false);
  });
});
