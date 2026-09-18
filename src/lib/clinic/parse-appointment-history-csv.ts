export type AppointmentHistoryCsvRow = {
  sourceLine: number;
  scheduledAt: Date;
  isOnline: boolean | null;
  status: string;
  client: string;
  isNewClient: boolean | null;
  professional: string;
  service: string;
  discount: number;
  finalPrice: number;
  paidAt: Date | null;
  notes: string;
};

export type AppointmentHistoryCsvResult = {
  rows: AppointmentHistoryCsvRow[];
  errors: Array<{ line: number; reason: string }>;
};

const REQUIRED_HEADERS = [
  'data_da_marcacao',
  'is_online',
  'estado',
  'cliente',
  'is_new_client',
  'colaborador',
  'servico',
  'desconto',
  'preco_final',
  'data_de_pagamento',
  'notas_da_marcacao',
] as const;

export function parseAppointmentHistoryCsv(
  input: string
): AppointmentHistoryCsvResult {
  const records = parseDelimited(input.replace(/^\uFEFF/, ''), ';');
  if (records.length === 0) return { rows: [], errors: [] };

  const headers = new Map<string, number>();
  records[0].forEach((value, index) => headers.set(normalize(value), index));
  const missing = REQUIRED_HEADERS.filter((header) => !headers.has(header));
  if (missing.length) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          reason: `Colunas ausentes: ${missing.join(', ')}.`,
        },
      ],
    };
  }

  const rows: AppointmentHistoryCsvRow[] = [];
  const errors: Array<{ line: number; reason: string }> = [];
  for (let index = 1; index < records.length; index++) {
    const record = records[index];
    if (record.every((value) => !value.trim())) continue;
    const line = index + 1;
    const value = (header: (typeof REQUIRED_HEADERS)[number]) =>
      clean(record[headers.get(header)!]);
    const scheduledAt = parsePortugueseDate(value('data_da_marcacao'));
    if (!scheduledAt) {
      errors.push({ line, reason: 'Data da marcação inválida ou vazia.' });
      continue;
    }
    rows.push({
      sourceLine: line,
      scheduledAt,
      isOnline: parseBoolean(value('is_online')),
      status: value('estado'),
      client: value('cliente'),
      isNewClient: parseBoolean(value('is_new_client')),
      professional: value('colaborador'),
      service: value('servico'),
      discount: parseMoney(value('desconto')),
      finalPrice: parseMoney(value('preco_final')),
      paidAt: parsePortugueseDate(value('data_de_pagamento')),
      notes: value('notas_da_marcacao'),
    });
  }
  return { rows, errors };
}

export function normalizeAppointmentMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value: string) {
  return normalizeAppointmentMatch(value).replace(/[^a-z0-9]+/g, '_');
}

function clean(value: string | undefined) {
  return (value ?? '').trim();
}

function parseBoolean(value: string): boolean | null {
  const normalized = normalizeAppointmentMatch(value);
  if (['1', 'true', 'sim', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'nao', 'no'].includes(normalized)) return false;
  return null;
}

function parseMoney(value: string): number {
  if (!value) return 0;
  const compact = value.replace(/[^\d,.-]/g, '');
  const normalized = compact.includes(',')
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

function parsePortugueseDate(value: string): Date | null {
  if (!value) return null;
  const match = value.match(
    /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T,]+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/
  );
  if (!match) {
    const native = new Date(value);
    return Number.isNaN(native.getTime()) ? null : native;
  }
  const [, day, month, year, hour = '0', minute = '0', second = '0'] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
  return date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day)
    ? date
    : null;
}

function parseDelimited(input: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field.replace(/\r$/, ''));
      records.push(record);
      record = [];
      field = '';
    } else field += char;
  }
  if (field || record.length) {
    record.push(field.replace(/\r$/, ''));
    records.push(record);
  }
  return records;
}
