import { describe, expect, it } from 'vitest';

import { compileQuery } from './query-compiler';

const context = { accountId: 'account-1', userId: 'user-1' };

describe('MySQL query compiler', () => {
  it('always scopes direct table reads to the authenticated account', () => {
    const query = compileQuery(
      {
        table: 'contacts',
        operation: 'select',
        columns: 'id, name',
        filters: [{ column: 'phone', operator: 'eq', value: '351900000000' }],
      },
      context
    );

    expect(query.sql).toContain('`account_id` = ?');
    expect(query.sql).toContain('`phone` = ?');
    expect(query.values).toEqual(['account-1', '351900000000']);
  });

  it('scopes child tables through their account-owned parent', () => {
    const query = compileQuery(
      { table: 'messages', operation: 'select', columns: '*' },
      context
    );

    expect(query.sql).toContain('EXISTS (SELECT 1 FROM `conversations`');
    expect(query.sql).toContain('`tenant_conversations`.`account_id` = ?');
    expect(query.values).toEqual(['account-1']);
  });

  it('overrides account and author identifiers on inserts', () => {
    const query = compileQuery(
      {
        table: 'contacts',
        operation: 'insert',
        values: {
          account_id: 'attacker-account',
          user_id: 'attacker-user',
          phone: '351900000000',
        },
      },
      context
    );

    expect(query.values).toContain('account-1');
    expect(query.values).toContain('user-1');
    expect(query.values).not.toContain('attacker-account');
    expect(query.values).not.toContain('attacker-user');
    expect(query.insertedIds).toHaveLength(1);
  });

  it('keeps the MySQL contact phone normalization column in sync', () => {
    const insert = compileQuery(
      {
        table: 'contacts',
        operation: 'insert',
        values: { phone: '+351 935 864 343' },
      },
      context
    );
    expect(insert.sql).toContain('`phone_normalized`');
    expect(insert.values).toContain('351935864343');

    const update = compileQuery(
      {
        table: 'contacts',
        operation: 'update',
        values: { phone: '+351 935 864 343' },
        filters: [{ column: 'id', operator: 'eq', value: 'contact-1' }],
      },
      context
    );
    expect(update.sql).toContain('`phone_normalized` = ?');
    expect(update.values).toContain('351935864343');
  });

  it('does not invent an id for account-keyed settings tables', () => {
    const query = compileQuery(
      {
        table: 'clinic_communication_settings',
        operation: 'upsert',
        values: { account_id: 'account-1', clinic_address: 'Lisboa' },
      },
      context
    );
    expect(query.sql).not.toContain('`id`');
    expect(query.insertedIds).toEqual([]);
  });

  it('rejects identifier injection', () => {
    expect(() =>
      compileQuery(
        { table: 'contacts; DROP TABLE contacts', operation: 'select' },
        context
      )
    ).toThrow('Invalid identifier');
  });

  it('selects base rows for relationship hydration', () => {
    const query = compileQuery(
      {
        table: 'conversations',
        operation: 'select',
        columns: '*, contact:contacts(*)',
      },
      context
    );
    expect(query.sql).toContain('SELECT * FROM `conversations`');
  });

  it('binds ISO instants as UTC dates for MySQL DATETIME fields and filters', () => {
    const instant = '2026-09-02T18:00:00.000Z';
    const query = compileQuery(
      {
        table: 'clinic_appointments',
        operation: 'insert',
        values: {
          scheduled_start: instant,
          scheduled_end: '2026-09-02T18:50:00.000Z',
        },
      },
      context
    );
    const filter = compileQuery(
      {
        table: 'clinic_appointments',
        operation: 'select',
        filters: [
          { column: 'scheduled_start', operator: 'gte', value: instant },
        ],
      },
      context
    );

    expect(query.values.some((value) => value instanceof Date)).toBe(true);
    expect(filter.values.at(-1)).toBeInstanceOf(Date);
    expect((filter.values.at(-1) as Date).toISOString()).toBe(instant);
  });
});
