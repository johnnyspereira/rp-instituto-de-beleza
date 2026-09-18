export type ServiceImportRow = {
  rowNumber: number;
  name: string;
  reference: string;
  description: string;
  category: string;
  durationMinutes: number | null;
  netPrice: number;
  taxRate: number;
  priceIncludesTax: boolean;
  commissionExecutantPercent: number;
  commissionResponsiblePercent: number;
  onlineEnabled: boolean;
  active: boolean;
};

export type ServiceImportResult = {
  rows: ServiceImportRow[];
  errors: string[];
  delimiter: ',' | ';' | '\t';
};

const HEADER_ALIASES = {
  name: ['name', 'nome', 'service', 'servico', 'serviço', 'procedimento'],
  reference: ['reference', 'referencia', 'referência', 'ref', 'ref.'],
  description: ['description', 'descricao', 'descrição'],
  category: ['category', 'categoria', 'category_id'],
  duration: ['duration_minutes', 'duration', 'duracao', 'duração', 'tempo'],
  price: ['unit_price', 'price', 'preco', 'preço', 'valor'],
  tax: ['tax_value', 'tax', 'iva'],
  commissionExecutant: ['comission', 'commission', 'comissao', 'comissão'],
  commissionResponsible: [
    'comission_salesperson',
    'commission_salesperson',
    'comissao_responsavel',
    'comissão responsável',
  ],
  online: ['online', 'online_enabled', 'marcacao_online'],
  active: ['active', 'ativo', 'is_active'],
} as const;

export function parseServiceCsv(content: string): ServiceImportResult {
  const text = content.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = detectDelimiter(firstLine);
  const records = parseDelimited(text, delimiter).filter((row) =>
    row.some((cell) => cell.trim())
  );
  if (!records.length) {
    return { rows: [], errors: ['O ficheiro está vazio.'], delimiter };
  }

  const headers = records[0].map(normalizeHeader);
  const find = (aliases: readonly string[]) =>
    headers.findIndex((header) =>
      aliases.map(normalizeHeader).includes(header)
    );
  const columns = {
    name: find(HEADER_ALIASES.name),
    reference: find(HEADER_ALIASES.reference),
    description: find(HEADER_ALIASES.description),
    category: find(HEADER_ALIASES.category),
    duration: find(HEADER_ALIASES.duration),
    price: find(HEADER_ALIASES.price),
    tax: find(HEADER_ALIASES.tax),
    commissionExecutant: find(HEADER_ALIASES.commissionExecutant),
    commissionResponsible: find(HEADER_ALIASES.commissionResponsible),
    online: find(HEADER_ALIASES.online),
    active: find(HEADER_ALIASES.active),
  };
  if (columns.name < 0) {
    return {
      rows: [],
      errors: ['Não foi encontrada uma coluna de nome do serviço.'],
      delimiter,
    };
  }

  const rows: ServiceImportRow[] = [];
  const errors: string[] = [];
  for (let index = 1; index < records.length; index += 1) {
    const record = records[index];
    const name = cleanCell(read(record, columns.name));
    if (!name) {
      errors.push(`Linha ${index + 1}: serviço sem nome.`);
      continue;
    }
    const rawPrice = cleanCell(read(record, columns.price));
    const rawTax = cleanCell(read(record, columns.tax));
    const sourceUsesNetPrice = headers[columns.price] === 'unit_price';
    rows.push({
      rowNumber: index + 1,
      name,
      reference: cleanExcelValue(read(record, columns.reference)),
      description: cleanCell(read(record, columns.description)),
      category: cleanCell(read(record, columns.category)) || 'Genérico',
      durationMinutes:
        columns.duration >= 0
          ? parseDuration(read(record, columns.duration))
          : null,
      netPrice: Math.max(0, parseLocalizedNumber(rawPrice, 0)),
      taxRate: normalizeRate(parseLocalizedNumber(rawTax, 0)),
      priceIncludesTax: !sourceUsesNetPrice,
      commissionExecutantPercent: normalizePercent(
        parseLocalizedNumber(read(record, columns.commissionExecutant), 0)
      ),
      commissionResponsiblePercent: normalizePercent(
        parseLocalizedNumber(read(record, columns.commissionResponsible), 0)
      ),
      onlineEnabled: parseBoolean(read(record, columns.online), true),
      active: parseBoolean(read(record, columns.active), true),
    });
  }

  return { rows: deduplicate(rows), errors, delimiter };
}

export function serviceImportGrossPrice(row: ServiceImportRow) {
  const value = row.priceIncludesTax
    ? row.netPrice
    : row.netPrice * (1 + row.taxRate);
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function detectDelimiter(line: string): ',' | ';' | '\t' {
  const counts = {
    ',': countOutsideQuotes(line, ','),
    ';': countOutsideQuotes(line, ';'),
    '\t': countOutsideQuotes(line, '\t'),
  };
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || ',') as
    ',' | ';' | '\t';
}

function countOutsideQuotes(value: string, needle: string) {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '"') {
      if (quoted && value[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && value[index] === needle) count += 1;
  }
  return count;
}

function parseDelimited(content: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (char === '"') {
      if (quoted && content[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && content[index + 1] === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function read(row: string[], index: number) {
  return index >= 0 ? row[index] || '' : '';
}

function cleanCell(value: string) {
  return value.trim();
}

function cleanExcelValue(value: string) {
  const clean = cleanCell(value);
  const formula = /^="(.*)"$/.exec(clean);
  return (formula?.[1] || clean).replace(/^'+/, '').trim();
}

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseLocalizedNumber(value: string, fallback: number) {
  const clean = cleanExcelValue(value)
    .replace(/[€$£%\s]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDuration(value: string) {
  const numeric = cleanExcelValue(value).match(/\d+(?:[.,]\d+)?/)?.[0] || '';
  const parsed = parseLocalizedNumber(numeric, 0);
  return parsed > 0 ? Math.round(parsed) : null;
}

function normalizeRate(value: number) {
  if (value <= 0) return 0;
  return value > 1 ? value / 100 : value;
}

function normalizePercent(value: number) {
  if (value <= 0) return 0;
  return Math.min(100, value <= 1 ? value * 100 : value);
}

function parseBoolean(value: string, fallback: boolean) {
  const normalized = cleanCell(value).toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'sim', 'yes', 'ativo'].includes(normalized)) return true;
  if (['0', 'false', 'não', 'nao', 'no', 'inativo'].includes(normalized))
    return false;
  return fallback;
}

function deduplicate(rows: ServiceImportRow[]) {
  const result = new Map<string, ServiceImportRow>();
  for (const row of rows) {
    const key = row.reference
      ? `reference:${row.reference.toLowerCase()}`
      : `name:${normalizeHeader(row.name)}`;
    result.set(key, row);
  }
  return Array.from(result.values());
}
