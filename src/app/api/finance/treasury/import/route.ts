import { NextResponse } from 'next/server';

import { loadAiConfig } from '@/lib/ai/config';
import { AiError } from '@/lib/ai/types';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { TREASURY_IMPORT_CATEGORIES } from '@/lib/finance/import-types';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';

const MAX_BYTES = 12 * 1024 * 1024;
const ACCEPTED = new Set([
  'application/pdf',
  'text/csv',
  'application/csv',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const prompt = `Extraia todos os movimentos financeiros do documento. Responda SOMENTE JSON valido no formato {"rows":[...]}. Cada item: kind ("payable" para saida/despesa/debito, "receivable" para entrada/credito), description, counterparty, category, amount (numero positivo), date (YYYY-MM-DD), currency (ISO, padrao EUR), reference, confidence (0 a 1) e settled (booleano: true quando o movimento ja ocorreu, como num extrato/recibo; false quando e fatura ou compromisso futuro). Categorias de despesas permitidas: ${TREASURY_IMPORT_CATEGORIES.join(', ')}. Para entradas use category "Outros". Nao invente movimentos, nao inclua saldos, totais, limites ou linhas sem transacao. Preserve uma linha por movimento.`;

type RawRow = Record<string, unknown>;

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('owner');
    const limit = checkRateLimit(
      `treasury-import:${userId}`,
      RATE_LIMITS.aiDraft
    );
    if (!limit.success) return rateLimitResponse(limit);

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0)
      return NextResponse.json(
        { error: 'Selecione um ficheiro.' },
        { status: 400 }
      );
    if (file.size > MAX_BYTES)
      return NextResponse.json(
        { error: 'O ficheiro deve ter no máximo 12 MB.' },
        { status: 400 }
      );
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (
      !ACCEPTED.has(file.type) &&
      !['csv', 'xls', 'xlsx', 'pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(
        extension ?? ''
      )
    )
      return NextResponse.json(
        { error: 'Formato não suportado.' },
        { status: 400 }
      );

    const config = await loadAiConfig(supabase, accountId, {
      requireActive: false,
    });
    if (!config)
      return NextResponse.json(
        {
          error: 'Configure primeiro a chave de IA em Configurações.',
          code: 'ai_not_configured',
        },
        { status: 400 }
      );

    const bytes = Buffer.from(await file.arrayBuffer());
    const isText = extension === 'csv' || file.type.includes('csv');
    const jsonText =
      config.provider === 'openai'
        ? await analyzeOpenAi(config.apiKey, config.model, file, bytes, isText)
        : await analyzeAnthropic(
            config.apiKey,
            config.model,
            file,
            bytes,
            isText
          );
    const parsed = parseJson(jsonText);
    const rows = (Array.isArray(parsed.rows) ? parsed.rows : [])
      .map(normalizeRow)
      .filter(Boolean);
    if (!rows.length)
      return NextResponse.json(
        { error: 'Nenhum movimento financeiro foi identificado.' },
        { status: 422 }
      );
    return NextResponse.json({ rows, filename: file.name });
  } catch (error) {
    if (error instanceof AiError)
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    return toErrorResponse(error);
  }
}

async function analyzeOpenAi(
  apiKey: string,
  model: string,
  file: File,
  bytes: Buffer,
  isText: boolean
) {
  const content: Record<string, unknown>[] = [
    { type: 'input_text', text: prompt },
  ];
  if (isText)
    content.push({
      type: 'input_text',
      text: bytes.toString('utf8').slice(0, 250_000),
    });
  else if (file.type.startsWith('image/'))
    content.push({
      type: 'input_image',
      image_url: `data:${file.type};base64,${bytes.toString('base64')}`,
    });
  else
    content.push({
      type: 'input_file',
      filename: file.name,
      file_data: `data:${file.type || 'application/octet-stream'};base64,${bytes.toString('base64')}`,
    });
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [{ role: 'user', content }],
      max_output_tokens: 8000,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const body = (await response.json().catch(() => null)) as {
    output_text?: string;
    output?: { content?: { text?: string }[] }[];
    error?: { message?: string };
  } | null;
  if (!response.ok)
    throw new AiError(
      body?.error?.message || `OpenAI API error (${response.status})`,
      { code: 'provider_error', status: 502 }
    );
  const text =
    body?.output_text ??
    body?.output
      ?.flatMap((item) => item.content ?? [])
      .map((item) => item.text ?? '')
      .join('');
  if (!text)
    throw new AiError('A IA devolveu uma resposta vazia.', {
      code: 'empty_response',
      status: 502,
    });
  return text;
}

async function analyzeAnthropic(
  apiKey: string,
  model: string,
  file: File,
  bytes: Buffer,
  isText: boolean
) {
  const content: Record<string, unknown>[] = [{ type: 'text', text: prompt }];
  if (isText)
    content.push({
      type: 'text',
      text: bytes.toString('utf8').slice(0, 250_000),
    });
  else if (file.type.startsWith('image/'))
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: file.type,
        data: bytes.toString('base64'),
      },
    });
  else if (
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf')
  )
    content.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: bytes.toString('base64'),
      },
    });
  else
    throw new AiError(
      'Excel requer o provedor OpenAI. Pode também exportar o ficheiro como CSV.',
      { code: 'unsupported_provider', status: 400 }
    );
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'pdfs-2024-09-25',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      messages: [{ role: 'user', content }],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const body = (await response.json().catch(() => null)) as {
    content?: { type?: string; text?: string }[];
    error?: { message?: string };
  } | null;
  if (!response.ok)
    throw new AiError(
      body?.error?.message || `Anthropic API error (${response.status})`,
      { code: 'provider_error', status: 502 }
    );
  const text = body?.content
    ?.filter((item) => item.type === 'text')
    .map((item) => item.text ?? '')
    .join('');
  if (!text)
    throw new AiError('A IA devolveu uma resposta vazia.', {
      code: 'empty_response',
      status: 502,
    });
  return text;
}

function parseJson(text: string): { rows?: RawRow[] } {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start)
    throw new AiError('A IA não devolveu dados estruturados.', {
      code: 'invalid_response',
      status: 502,
    });
  return JSON.parse(cleaned.slice(start, end + 1)) as { rows?: RawRow[] };
}

function normalizeRow(row: RawRow, index: number) {
  const amount = Math.abs(Number(row.amount));
  const date = String(row.date ?? '').slice(0, 10);
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  )
    return null;
  const category = TREASURY_IMPORT_CATEGORIES.includes(row.category as never)
    ? String(row.category)
    : 'Outros';
  return {
    id: `import-${index}-${crypto.randomUUID()}`,
    selected: true,
    kind: row.kind === 'receivable' ? 'receivable' : 'payable',
    description: String(
      row.description || row.counterparty || 'Movimento importado'
    ).slice(0, 240),
    counterparty: String(row.counterparty || '').slice(0, 160),
    category,
    amount: Math.round(amount * 100) / 100,
    date,
    currency: /^[A-Z]{3}$/.test(String(row.currency))
      ? String(row.currency)
      : 'EUR',
    reference: String(row.reference || '').slice(0, 160),
    confidence: Math.max(0, Math.min(1, Number(row.confidence) || 0.7)),
    settled: row.settled !== false,
  };
}
