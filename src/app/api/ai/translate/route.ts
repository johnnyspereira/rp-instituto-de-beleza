import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { loadAiConfig } from '@/lib/ai/config';
import { generateReply } from '@/lib/ai/generate';
import { AiError } from '@/lib/ai/types';

const MAX_TEXT_LENGTH = 8_000;

/**
 * POST /api/ai/translate (agent+)
 *
 * Translates text for the Inbox only. The text is never sent to WhatsApp or
 * saved over the original message; the agent must explicitly send a draft.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');
    const limit = checkRateLimit(`ai-translate:${userId}`, RATE_LIMITS.aiDraft);
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const targetLanguage = body?.target_language === 'en' ? 'en' : 'pt';

    if (!text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `text must be at most ${MAX_TEXT_LENGTH} characters` },
        { status: 400 }
      );
    }

    // Translation is useful even when auto-replies are disabled, so only a
    // configured key is required here, not the assistant master switch.
    const config = await loadAiConfig(supabase, accountId, {
      requireActive: false,
    }).catch((err) => {
      console.error('[ai/translate] loadAiConfig error:', err);
      throw new AiError('Stored API key could not be decrypted.', {
        code: 'key_decrypt_failed',
        status: 400,
      });
    });
    if (!config) {
      return NextResponse.json(
        {
          error: 'A tradução por IA ainda não está configurada.',
          code: 'ai_not_configured',
        },
        { status: 400 }
      );
    }

    const targetName = targetLanguage === 'en' ? 'English' : 'Portuguese';
    const { text: translation } = await generateReply({
      config,
      systemPrompt:
        `You are a precise translator. Translate the user's text into ${targetName}. ` +
        'Return only the translated text. Preserve line breaks, names, phone numbers, URLs, emojis, formatting markers, and the original tone. Do not add explanations or quotation marks.',
      messages: [{ role: 'user', content: text }],
    });

    if (!translation) {
      throw new AiError('The translation service returned an empty result.');
    }

    return NextResponse.json({ translation, target_language: targetLanguage });
  } catch (err) {
    if (err instanceof AiError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status }
      );
    }
    return toErrorResponse(err);
  }
}
