import { AiError, type ProviderResult } from '../types';
import { MAX_OUTPUT_TOKENS } from '../defaults';
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  type ProviderArgs,
} from './shared';

interface OllamaResponse {
  choices?: { message?: { content?: string } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * Ollama is reached through the dedicated authenticated AI Worker, never by
 * exposing the local Ollama port to the public internet or loading the
 * WhatsApp Worker.
 */
export async function generateOllama(
  args: ProviderArgs
): Promise<ProviderResult> {
  const workerUrl = process.env.AI_WORKER_URL?.replace(/\/+$/, '');
  const workerSecret = process.env.AI_WORKER_SECRET?.trim();
  if (!workerUrl || !workerSecret) {
    throw new AiError(
      'Ollama requires a dedicated AI Worker connection.',
      {
        code: 'ollama_worker_not_configured',
        status: 503,
      }
    );
  }

  let res: Response;
  try {
    res = await fetch(`${workerUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${workerSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: args.model,
        messages: [
          { role: 'system', content: args.systemPrompt },
          ...mergeConsecutive(args.messages),
        ],
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        timeout_ms: args.timeoutMs,
      }),
      signal: AbortSignal.timeout(args.timeoutMs + 5_000),
    });
  } catch (err) {
    throw toNetworkError(err);
  }
  if (!res.ok) throw await providerHttpError('Ollama Worker', res);
  const data = (await res.json().catch(() => null)) as OllamaResponse | null;
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text)
    throw new AiError('Ollama returned an empty response.', {
      code: 'empty_response',
    });
  return {
    text,
    usage: normalizeUsage({
      prompt: data?.usage?.prompt_tokens,
      completion: data?.usage?.completion_tokens,
      total: data?.usage?.total_tokens,
    }),
  };
}
