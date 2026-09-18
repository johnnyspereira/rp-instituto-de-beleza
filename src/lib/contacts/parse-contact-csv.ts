/** CSV parsing shared by the client import preview and persistence flow. */

export interface ParsedContactRow {
  phone: string;
  clientReference?: string;
  name?: string;
  email?: string;
  company?: string;
  birthDate?: string;
  taxId?: string;
  gender?: 'male' | 'female' | 'non_binary' | 'not_informed';
  addressLine?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  source?: string;
  marketingConsent?: boolean;
  whatsappConsent?: boolean;
  tagNames: string[];
}

export interface ParseContactCsvResult {
  rows: ParsedContactRow[];
  hasTagsColumn: boolean;
  hasCompanyColumn: boolean;
  delimiter: ',' | ';' | '\t';
}

type HeaderMap = Map<string, number>;

const PHONE_HEADERS = ['phone', 'mobile', 'telefone', 'telemovel', 'celular'];
const CLIENT_REFERENCE_HEADERS = [
  'client_reference',
  'customer_reference',
  'reference',
  'referencia',
  'ref',
  'nr',
  'numero',
  'numero_cliente',
  'n_cliente',
];
const NAME_HEADERS = ['name', 'full_name', 'nome', 'cliente'];
const EMAIL_HEADERS = ['email', 'e_mail', 'correio'];
const COMPANY_HEADERS = ['company', 'empresa', 'organization', 'organizacao'];
const TAG_HEADERS = [
  'tags',
  'tag',
  'etiquetas',
  'segment_manual',
  'segment_automatic',
  'segmentos',
];

export function decodeContactCsv(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export function parseTagCell(value: string | undefined): string[] {
  if (!value?.trim()) return [];

  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of value.split(/[,;]/)) {
    const name = cleanCell(part);
    if (!name) continue;
    const key = normalizeHeader(name);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

export function parseContactCsv(text: string): ParseContactCsvResult {
  const source = text.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(source);
  const records = parseCsvRecords(source, delimiter);
  if (records.length < 2) return emptyResult(delimiter);

  const headers = new Map<string, number>();
  records[0].forEach((header, index) => {
    const key = normalizeHeader(header);
    if (key && !headers.has(key)) headers.set(key, index);
  });

  const phoneIdx = findHeader(headers, PHONE_HEADERS);
  if (phoneIdx < 0) return emptyResult(delimiter);

  const rows: ParsedContactRow[] = [];
  for (const record of records.slice(1)) {
    const phone = cleanPhone(record[phoneIdx]);
    if (!phone) continue;

    const tagNames = uniqueTags(
      TAG_HEADERS.flatMap((header) =>
        parseTagCell(valueByHeader(record, headers, [header]))
      )
    );
    const birthDate = parseBirthDate(record, headers);
    const gender = parseGender(
      valueByHeader(record, headers, ['gender', 'genero', 'sexo'])
    );
    const marketingConsent = parseBoolean(
      valueByHeader(record, headers, [
        'marketing_consent',
        'data_protection_type_campaigns',
        'aceita_campanhas',
      ])
    );
    const whatsappConsent = parseBoolean(
      valueByHeader(record, headers, [
        'whatsapp_consent',
        'consentimento_whatsapp',
      ])
    );

    rows.push(
      compactRow({
        phone,
        clientReference: valueByHeader(
          record,
          headers,
          CLIENT_REFERENCE_HEADERS
        ),
        name: valueByHeader(record, headers, NAME_HEADERS),
        email: valueByHeader(record, headers, EMAIL_HEADERS),
        company: valueByHeader(record, headers, COMPANY_HEADERS),
        birthDate,
        taxId: valueByHeader(record, headers, [
          'tax_id',
          'vat_number',
          'nif',
          'contribuinte',
        ]),
        gender,
        addressLine: valueByHeader(record, headers, [
          'address_line',
          'address',
          'morada',
          'endereco',
        ]),
        postalCode: valueByHeader(record, headers, [
          'postal_code',
          'zipcode',
          'codigo_postal',
          'cep',
        ]),
        city: valueByHeader(record, headers, ['city', 'cidade', 'localidade']),
        country: valueByHeader(record, headers, ['country', 'pais']),
        source: valueByHeader(record, headers, [
          'source',
          'crm_source',
          'origem',
        ]),
        marketingConsent,
        whatsappConsent,
        tagNames,
      })
    );
  }

  return {
    rows,
    hasTagsColumn: TAG_HEADERS.some((header) => headers.has(header)),
    hasCompanyColumn: COMPANY_HEADERS.some((header) => headers.has(header)),
    delimiter,
  };
}

export function contactImportValues(row: ParsedContactRow) {
  return removeUndefined({
    phone: row.phone,
    client_reference: row.clientReference,
    name: row.name,
    email: row.email,
    company: row.company,
    birth_date: row.birthDate,
    tax_id: row.taxId,
    gender: row.gender,
    address_line: row.addressLine,
    postal_code: row.postalCode,
    city: row.city,
    country: row.country,
    source: row.source,
    marketing_consent: row.marketingConsent,
    whatsapp_consent: row.whatsappConsent,
  });
}

function emptyResult(delimiter: ',' | ';' | '\t'): ParseContactCsvResult {
  return {
    rows: [],
    hasTagsColumn: false,
    hasCompanyColumn: false,
    delimiter,
  };
}

function compactRow(row: ParsedContactRow): ParsedContactRow {
  return removeUndefined(row) as ParsedContactRow;
}

function removeUndefined<T extends object>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as Partial<T>;
}

function normalizeHeader(value: string): string {
  return cleanCell(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function cleanCell(value: string | undefined): string {
  if (!value) return '';
  let cleaned = value.trim();
  const formula = cleaned.match(/^=\s*"([\s\S]*)"$/);
  if (formula) cleaned = formula[1];
  return cleaned.trim();
}

function cleanPhone(value: string | undefined): string {
  const cleaned = cleanCell(value);
  if (!cleaned) return '';
  const hasPlus = cleaned.includes('+');
  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return '';
  return hasPlus ? `+${digits}` : digits;
}

function findHeader(headers: HeaderMap, aliases: string[]): number {
  for (const alias of aliases) {
    const index = headers.get(alias);
    if (index !== undefined) return index;
  }
  return -1;
}

function valueByHeader(
  record: string[],
  headers: HeaderMap,
  aliases: string[]
): string | undefined {
  const index = findHeader(headers, aliases);
  if (index < 0) return undefined;
  return cleanCell(record[index]) || undefined;
}

function parseGender(
  value: string | undefined
): ParsedContactRow['gender'] | undefined {
  const normalized = normalizeHeader(value ?? '');
  if (['m', 'male', 'masculino', 'homem'].includes(normalized)) return 'male';
  if (['f', 'female', 'feminino', 'mulher'].includes(normalized)) {
    return 'female';
  }
  if (['non_binary', 'nao_binario'].includes(normalized)) return 'non_binary';
  if (['not_informed', 'nao_informado'].includes(normalized)) {
    return 'not_informed';
  }
  return undefined;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const normalized = normalizeHeader(value);
  if (['1', 'true', 'yes', 'sim', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'nao', 'n'].includes(normalized)) return false;
  return undefined;
}

function parseBirthDate(
  record: string[],
  headers: HeaderMap
): string | undefined {
  const direct = valueByHeader(record, headers, [
    'birth_date',
    'data_nascimento',
    'nascimento',
  ]);
  if (direct) {
    const parsed = new Date(direct);
    if (!Number.isNaN(parsed.getTime()))
      return parsed.toISOString().slice(0, 10);
  }

  const year = Number(
    valueByHeader(record, headers, ['birth_year', 'ano_nascimento'])
  );
  const month = Number(
    valueByHeader(record, headers, ['birth_month', 'mes_nascimento'])
  );
  const day = Number(
    valueByHeader(record, headers, ['birth_day', 'dia_nascimento'])
  );
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function uniqueTags(values: string[]): string[] {
  const tags = new Map<string, string>();
  for (const value of values) {
    const key = normalizeHeader(value);
    if (key && !tags.has(key)) tags.set(key, value);
  }
  return Array.from(tags.values());
}

function detectDelimiter(text: string): ',' | ';' | '\t' {
  const firstRecord = text.split(/\r?\n/, 1)[0] ?? '';
  const candidates = [',', ';', '\t'] as const;
  let selected: ',' | ';' | '\t' = ',';
  let best = -1;
  for (const candidate of candidates) {
    const count = parseCsvRecords(firstRecord, candidate)[0]?.length ?? 0;
    if (count > best) {
      selected = candidate;
      best = count;
    }
  }
  return selected;
}

function parseCsvRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      record.push(cell);
      cell = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      record.push(cell);
      if (record.some((value) => value.trim())) records.push(record);
      record = [];
      cell = '';
      continue;
    }
    cell += char;
  }

  record.push(cell);
  if (record.some((value) => value.trim())) records.push(record);
  return records;
}
