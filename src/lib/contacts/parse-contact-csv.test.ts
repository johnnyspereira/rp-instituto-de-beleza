import { describe, expect, it } from 'vitest';
import {
  contactImportValues,
  decodeContactCsv,
  parseContactCsv,
  parseTagCell,
} from './parse-contact-csv';

describe('parseTagCell', () => {
  it('splits comma-separated tags and trims whitespace', () => {
    expect(parseTagCell(' VIP , Lead ,  ')).toEqual(['VIP', 'Lead']);
  });

  it('splits semicolon-separated tags', () => {
    expect(parseTagCell('VIP; Lead; Customer')).toEqual([
      'VIP',
      'Lead',
      'Customer',
    ]);
  });

  it('de-dupes case-insensitively', () => {
    expect(parseTagCell('vip, VIP, Lead')).toEqual(['vip', 'Lead']);
  });

  it('returns empty for blank values', () => {
    expect(parseTagCell('')).toEqual([]);
    expect(parseTagCell(undefined)).toEqual([]);
  });
});

describe('parseContactCsv', () => {
  it('falls back to Windows-1252 without corrupting accented fields', () => {
    const bytes = new Uint8Array([
      112, 104, 111, 110, 101, 59, 116, 97, 103, 115, 10, 43, 51, 53, 49, 57,
      49, 49, 49, 49, 49, 49, 49, 59, 67, 108, 105, 101, 110, 116, 101, 115, 32,
      115, 101, 109, 32, 100, 237, 118, 105, 100, 97,
    ]);
    expect(decodeContactCsv(bytes)).toContain('Clientes sem dívida');
  });

  it('parses optional tags column', () => {
    const csv = `phone,name,tags
+15551234567,Alice,"VIP, Lead"
+15559876543,Bob,Customer`;

    expect(parseContactCsv(csv)).toEqual({
      delimiter: ',',
      hasTagsColumn: true,
      hasCompanyColumn: false,
      rows: [
        {
          phone: '+15551234567',
          name: 'Alice',
          email: undefined,
          company: undefined,
          tagNames: ['VIP', 'Lead'],
        },
        {
          phone: '+15559876543',
          name: 'Bob',
          email: undefined,
          company: undefined,
          tagNames: ['Customer'],
        },
      ],
    });
  });

  it('returns empty tagNames when tags column is absent', () => {
    const csv = `phone,name
+15551234567,Alice`;

    expect(parseContactCsv(csv)).toEqual({
      delimiter: ',',
      hasTagsColumn: false,
      hasCompanyColumn: false,
      rows: [
        {
          phone: '+15551234567',
          name: 'Alice',
          email: undefined,
          company: undefined,
          tagNames: [],
        },
      ],
    });
  });

  it('recognizes semicolon exports and Excel-formula phone cells', () => {
    const csv = `nr;name;email;mobile;gender;birth_month;birth_day;birth_year;vat_number;address;zipcode;city;segment_automatic;segment_manual;crm_source;data_protection_type_campaigns
1;"Cliente Exemplo";cliente@example.com;"=""+351900000000""";m;12;23;1994;123456789;"Rua Principal, 35";1750-414;Lisboa;"Clientes Ativos,Masculino";Instagram;"Online - Instagram";1`;

    const result = parseContactCsv(csv);
    expect(result.delimiter).toBe(';');
    expect(result.hasTagsColumn).toBe(true);
    expect(result.rows).toEqual([
      {
        phone: '+351900000000',
        clientReference: '1',
        name: 'Cliente Exemplo',
        email: 'cliente@example.com',
        birthDate: '1994-12-23',
        taxId: '123456789',
        gender: 'male',
        addressLine: 'Rua Principal, 35',
        postalCode: '1750-414',
        city: 'Lisboa',
        source: 'Online - Instagram',
        marketingConsent: true,
        tagNames: ['Instagram', 'Clientes Ativos', 'Masculino'],
      },
    ]);
  });

  it('only emits present values so blank CSV cells do not erase CRM data', () => {
    expect(
      contactImportValues({
        phone: '+351900000000',
        name: 'Cliente',
        email: undefined,
        tagNames: [],
      })
    ).toEqual({ phone: '+351900000000', name: 'Cliente' });
  });

  it('maps nr and common reference headers to the client reference', () => {
    const aliases = [
      'nr',
      'ref',
      'referência',
      'client_reference',
      'numero_cliente',
    ];

    for (const header of aliases) {
      const result = parseContactCsv(
        `${header},mobile,name\n0042,+351900000000,Cliente`
      );
      expect(result.rows[0]?.clientReference).toBe('0042');
      expect(contactImportValues(result.rows[0]!)).toMatchObject({
        client_reference: '0042',
      });
    }
  });
});
