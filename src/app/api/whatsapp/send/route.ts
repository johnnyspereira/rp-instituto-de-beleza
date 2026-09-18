import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import {
  sendMessageToConversation,
  validateSendMessageParams,
  SendMessageError,
} from '@/lib/whatsapp/send-message';
import {
  interactivePayloadToText,
  type InteractiveMessagePayload,
} from '@/lib/whatsapp/interactive';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';
import { enqueueWhatsAppMessage } from '@/lib/whatsapp/outbox';
import type { MessageTemplate } from '@/types';

function qrSendErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : 'Falha ao enviar pela sessão WhatsApp QR.';
  const normalized = message.toLowerCase();

  if (
    normalized.includes('invalid or not registered') ||
    normalized.includes('not a registered user') ||
    normalized.includes('not registered on whatsapp')
  ) {
    return 'O WhatsApp não reconheceu o telefone deste cliente. Confirme o indicativo do país e se o número possui WhatsApp.';
  }
  if (
    normalized.includes('session is not connected') ||
    normalized.includes('client is not ready') ||
    normalized.includes('detached frame')
  ) {
    return 'A sessão WhatsApp QR está temporariamente indisponível. Aguarde a reconexão e tente novamente.';
  }

  return message;
}

// The dashboard's outbound-send endpoint. It owns auth, per-user rate
// limiting, and the two ways the UI targets a thread — an existing
// `conversation_id` (inbox) or a `contact_id` (Contact detail →
// find-or-create the conversation). The actual Meta plumbing (validate
// → send → persist → pause flows) lives in the shared
// `sendMessageToConversation` core, which the public `/api/v1/messages`
// endpoint reuses. This route is a thin adapter: resolve the
// conversation, delegate, then map `SendMessageError` back onto the
// dashboard's internal `{ error }` shape.
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Per-user rate limit. Bucket key is scoped to this route so
    // `/broadcast` has an independent budget.
    const limit = checkRateLimit(`send:${user.id}`, RATE_LIMITS.send);
    if (!limit.success) {
      return rateLimitResponse(limit);
    }

    // Resolve the caller's account_id. Every downstream lookup
    // (conversation, whatsapp_config, message_templates) is account-
    // scoped post-multi-user, so the previous `user_id` filters
    // returned nothing for teammates who didn't author the row.
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();
    const accountId = profile?.account_id as string | undefined;
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      // `conversation_id` targets an existing thread (inbox). `contact_id`
      // lets a caller initiate from a contact that may have no conversation
      // yet (Contact detail → Send template) — we find-or-create one below.
      conversation_id: conversationIdInput,
      contact_id,
      message_type,
      content_text,
      media_url,
      filename,
      template_name,
      template_language,
      template_params,
      template_message_params,
      interactive_payload,
      reply_to_message_id,
      client_request_id,
    } = body;

    if ((!conversationIdInput && !contact_id) || !message_type) {
      return NextResponse.json(
        {
          error:
            'Either conversation_id or contact_id, plus message_type, are required',
        },
        { status: 400 }
      );
    }

    // Validate the message shape up front — before the contact_id path
    // finds-or-creates a conversation — so an invalid payload 400s
    // without leaving an orphan empty conversation behind.
    try {
      validateSendMessageParams({
        messageType: message_type,
        contentText: content_text,
        mediaUrl: media_url,
        templateName: template_name,
        interactivePayload: interactive_payload,
      });
    } catch (err) {
      if (err instanceof SendMessageError) {
        return NextResponse.json(
          { error: err.message },
          { status: err.status }
        );
      }
      throw err;
    }

    // Resolve the target conversation. With `conversation_id` we load the
    // existing thread; with `contact_id` we find-or-create one for the
    // contact so a business-initiated template send (Contact detail view)
    // reuses the shared send core below.
    let conversationId: string | null = null;

    if (conversationIdInput) {
      const { data, error: convError } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', conversationIdInput)
        .eq('account_id', accountId)
        .single();

      if (convError || !data) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 }
        );
      }
      conversationId = data.id;
    } else {
      // contact_id path: verify the contact is in this account first so a
      // caller can't open a conversation against someone else's contact.
      const { data: contactRow, error: contactErr } = await supabase
        .from('contacts')
        .select('id')
        .eq('id', contact_id)
        .eq('account_id', accountId)
        .maybeSingle();

      if (contactErr || !contactRow) {
        return NextResponse.json(
          { error: 'Contact not found' },
          { status: 404 }
        );
      }

      const resolved = await findOrCreateConversation(
        supabase,
        accountId,
        user.id,
        contact_id
      );
      if (!resolved) {
        return NextResponse.json(
          { error: 'Failed to open a conversation for this contact' },
          { status: 500 }
        );
      }
      conversationId = resolved;
    }

    if (!conversationId) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Route Inbox text through the durable outbox. Calling the remote Worker
    // synchronously made the Inbox depend on a second HTTP hop and could turn
    // a healthy QR session into a 502 in the browser. The Worker claims this
    // queue every few seconds and updates this same message record.
    if (
      remoteWhatsAppWorker.enabled() &&
      ['text', 'interactive'].includes(message_type)
    ) {
      const requestKey =
        typeof client_request_id === 'string' && client_request_id.trim()
          ? client_request_id.trim().slice(0, 100)
          : crypto.randomUUID();
      try {
        const queued = await enqueueWhatsAppMessage({
          accountId,
          userId: user.id,
          conversationId,
          requestKey,
          payload: {
            contentType: message_type,
            text:
              message_type === 'interactive'
                ? interactivePayloadToText(interactive_payload)
                : content_text || '',
            mediaUrl: media_url || null,
            filename: filename || null,
            templateName: template_name || null,
            interactivePayload: interactive_payload || null,
            replyToMessageId: reply_to_message_id || null,
            senderType: 'agent',
          },
        });
        return NextResponse.json({
          success: true,
          queued: true,
          duplicate: queued.duplicate,
          message_id: queued.messageId,
          queue_status: queued.status,
        });
      } catch (error) {
        console.error('[whatsapp/send] enqueue failed:', error);
        return NextResponse.json(
          { error: 'Não foi possível colocar a mensagem na fila.' },
          { status: 500 }
        );
      }
    }

    const qrCapableTypes = [
      'text',
      'interactive',
      'template',
      'image',
      'video',
      'document',
      'audio',
    ];
    const canUseMetaFallback = !['text', 'interactive'].includes(message_type);
    const hasMetaConfig = canUseMetaFallback
      ? await accountHasMetaConfig(supabase, accountId)
      : false;
    const qrRequired =
      message_type === 'text' ||
      message_type === 'interactive' ||
      !hasMetaConfig;

    // Templates and media can use Meta directly when that integration is
    // configured. Only messages that require the QR session must fail when
    // the remote Worker is unavailable.
    if (!remoteWhatsAppWorker.enabled() && qrRequired) {
      return NextResponse.json(
        { error: 'WhatsApp remoto não configurado. Defina WHATSAPP_MODE=remote_worker.' },
        { status: 503 }
      );
    }

    if (qrCapableTypes.includes(message_type)) {
      const useRemoteQr = remoteWhatsAppWorker.enabled();
      const qrStatus = useRemoteQr
        ? await remoteWhatsAppWorker.status({
            accountId,
            userId: user.id,
            autoStart: qrRequired,
          })
        : await waitForQrConnection(accountId, user.id, {
            autoStart: qrRequired,
            timeoutMs: qrRequired ? 25000 : 0,
          });

      if (!qrStatus.connected && qrRequired) {
        return NextResponse.json(
          {
            error:
              qrStatus.lastError ||
              `WhatsApp QR session is not connected (state: ${qrStatus.state}).`,
          },
          { status: 400 }
        );
      }

      if (qrStatus.connected) {
        try {
          const textToSend =
            message_type === 'interactive'
              ? interactivePayloadToText(interactive_payload)
              : message_type === 'template'
                ? await renderTemplateForQr({
                    supabase,
                    accountId,
                    templateName: template_name,
                    templateLanguage: template_language,
                    templateParams: template_params,
                    templateMessageParams: template_message_params,
                    fallbackText: content_text,
                  })
                : content_text || '';

          const result = useRemoteQr
            ? await remoteWhatsAppWorker.send({
                accountId,
                userId: user.id,
                conversationId,
                message: {
                  text: textToSend,
                  contentType: message_type,
                  mediaUrl: media_url,
                  filename,
                  templateName: template_name,
                  interactivePayload: interactive_payload,
                  replyToMessageId: reply_to_message_id,
                  senderType: 'agent',
                },
              })
            : message_type === 'text'
              ? await sendTextViaLocalQr(
                  accountId,
                  conversationId,
                  textToSend,
                  {
                    replyToMessageId: reply_to_message_id,
                  }
                )
              : await sendMessageViaLocalQr(accountId, conversationId, {
                  text: textToSend,
                  contentType: message_type,
                  mediaUrl: media_url,
                  filename,
                  templateName: template_name,
                  interactivePayload: interactive_payload,
                  replyToMessageId: reply_to_message_id,
                });

          return NextResponse.json({
            success: true,
            message_id: result.messageId,
            whatsapp_message_id: result.whatsappMessageId,
          });
        } catch (qrErr) {
          console.warn(
            '[whatsapp/send] QR send failed:',
            qrErr instanceof Error ? qrErr.message : qrErr
          );
          return NextResponse.json(
            {
              error: qrSendErrorMessage(qrErr),
            },
            { status: 502 }
          );
        }
      }
    }

    // Delegate to the shared send core (validates, sends to Meta with
    // phone-variant retry, persists, pauses active flow runs). Its
    // `SendMessageError` carries a machine code + HTTP status; the
    // dashboard maps it to the internal `{ error }` shape.
    try {
      const result = await sendMessageToConversation(supabase, accountId, {
        conversationId,
        messageType: message_type,
        contentText: content_text,
        mediaUrl: media_url,
        filename,
        templateName: template_name,
        templateLanguage: template_language,
        templateParams: template_params,
        templateMessageParams: template_message_params,
        interactivePayload: interactive_payload,
        replyToMessageId: reply_to_message_id,
      });

      return NextResponse.json({
        success: true,
        message_id: result.messageId,
        whatsapp_message_id: result.whatsappMessageId,
      });
    } catch (err) {
      if (err instanceof SendMessageError) {
        return NextResponse.json(
          { error: err.message },
          { status: err.status }
        );
      }
      throw err;
    }
  } catch (error) {
    console.error('Error in WhatsApp send POST:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}

type SendSupabase = Awaited<ReturnType<typeof createClient>>;
type LocalQrContentType =
  | 'text'
  | 'template'
  | 'interactive'
  | 'image'
  | 'video'
  | 'document'
  | 'audio';

async function waitForQrConnection(
  accountId: string,
  userId: string,
  options: { autoStart?: boolean; timeoutMs?: number } = {}
) {
  const { getBaileysSessionStatus, startBaileysSession } =
    await import('@/lib/whatsapp/baileys');
  const autoStart = options.autoStart ?? true;
  const timeoutMs = options.timeoutMs ?? 25000;
  let status = await startBaileysSession({
    accountId,
    userId,
    autoStart,
  });
  const deadline = Date.now() + timeoutMs;

  while (
    timeoutMs > 0 &&
    !status.connected &&
    status.state !== 'qr' &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    status = await getBaileysSessionStatus();
  }

  return status;
}

async function sendTextViaLocalQr(
  accountId: string,
  conversationId: string,
  text: string,
  options: {
    senderType?: 'agent' | 'bot';
    replyToMessageId?: string | null;
  } = {}
) {
  const { sendTextViaBaileys } = await import('@/lib/whatsapp/baileys');
  return sendTextViaBaileys(accountId, conversationId, text, options);
}

async function sendMessageViaLocalQr(
  accountId: string,
  conversationId: string,
  input: {
    text: string;
    contentType?: LocalQrContentType;
    mediaUrl?: string | null;
    filename?: string | null;
    templateName?: string | null;
    interactivePayload?: InteractiveMessagePayload | null;
    replyToMessageId?: string | null;
    senderType?: 'agent' | 'bot';
  }
) {
  const { sendMessageViaBaileys } = await import('@/lib/whatsapp/baileys');
  return sendMessageViaBaileys(accountId, conversationId, input);
}

async function accountHasMetaConfig(supabase: SendSupabase, accountId: string) {
  const { data } = await supabase
    .from('whatsapp_config')
    .select('id')
    .eq('account_id', accountId)
    .maybeSingle();

  return Boolean(data?.id);
}

/**
 * Return the contact's conversation id in this account, creating one if
 * it doesn't exist yet. Mirrors the webhook's find-or-create so an
 * inbound-then-outbound (or outbound-first) sequence converges on a single
 * thread per contact. Runs under the caller's RLS — the conversations_insert
 * policy requires account agent membership, which the caller already is.
 */
async function findOrCreateConversation(
  supabase: SendSupabase,
  accountId: string,
  userId: string,
  contactId: string
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: userId,
      contact_id: contactId,
    })
    .select('id')
    .single();

  if (error) {
    console.error(
      'Error creating conversation for contact send:',
      error.message
    );
    return null;
  }

  return created.id;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) =>
        typeof item === 'string' ? item : String(item ?? '')
      )
    : [];
}

function renderTemplateValue(
  value: string | null | undefined,
  params: string[]
) {
  return (value ?? '').replace(/\{\{(\d+)\}\}/g, (_, raw) => {
    const idx = Number(raw) - 1;
    const replacement = params[idx];
    return replacement && replacement.trim() ? replacement : `{{${raw}}}`;
  });
}

async function renderTemplateForQr(input: {
  supabase: SendSupabase;
  accountId: string;
  templateName?: string | null;
  templateLanguage?: string | null;
  templateParams?: unknown;
  templateMessageParams?: unknown;
  fallbackText?: string | null;
}) {
  if (input.fallbackText?.trim()) return input.fallbackText.trim();
  if (!input.templateName) return '';

  const messageParams =
    input.templateMessageParams &&
    typeof input.templateMessageParams === 'object'
      ? (input.templateMessageParams as {
          body?: unknown;
          headerText?: unknown;
        })
      : null;
  const bodyParams = messageParams?.body
    ? asStringArray(messageParams.body)
    : asStringArray(input.templateParams);

  const { data } = await input.supabase
    .from('message_templates')
    .select('*')
    .eq('account_id', input.accountId)
    .eq('name', input.templateName)
    .eq('language', input.templateLanguage || 'en_US')
    .maybeSingle();

  const template = data as MessageTemplate | null;
  if (!template?.body_text) return input.templateName;

  const parts = [
    template.header_type === 'text'
      ? typeof messageParams?.headerText === 'string'
        ? messageParams.headerText
        : renderTemplateValue(template.header_content, bodyParams)
      : '',
    renderTemplateValue(template.body_text, bodyParams),
    renderTemplateValue(template.footer_text, bodyParams),
  ].filter((part) => part.trim().length > 0);

  return parts.join('\n\n').trim();
}
