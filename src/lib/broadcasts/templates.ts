import type {
  Contact,
  MessageTemplate,
  QuickReply,
  QuickReplyKind,
} from '@/types';
import {
  interactivePayloadPreviewText,
  type InteractiveMessagePayload,
} from '@/lib/whatsapp/interactive';

export type BroadcastTemplate = MessageTemplate & {
  broadcast_template_source?: 'meta' | 'internal';
  quick_reply_id?: string;
  internal_kind?: QuickReplyKind;
  interactive_payload?: InteractiveMessagePayload | null;
};

export function isInternalBroadcastTemplate(
  template: BroadcastTemplate | null | undefined
): template is BroadcastTemplate & {
  broadcast_template_source: 'internal';
} {
  return template?.broadcast_template_source === 'internal';
}

export function quickReplyToBroadcastTemplate(
  quickReply: QuickReply
): BroadcastTemplate {
  const bodyText =
    quickReply.kind === 'interactive' && quickReply.interactive_payload
      ? interactivePayloadPreviewText(quickReply.interactive_payload)
      : quickReply.content_text || '';

  return {
    id: `quick-reply:${quickReply.id}`,
    user_id: quickReply.user_id,
    name: quickReply.title,
    category: 'Utility',
    language: 'internal',
    body_text: bodyText,
    status: 'APPROVED',
    created_at: quickReply.created_at,
    broadcast_template_source: 'internal',
    quick_reply_id: quickReply.id,
    internal_kind: quickReply.kind,
    interactive_payload: quickReply.interactive_payload ?? null,
  };
}

export function markMetaBroadcastTemplate(
  template: MessageTemplate
): BroadcastTemplate {
  return {
    ...template,
    broadcast_template_source: 'meta',
  };
}

export function renderInternalBroadcastText(
  text: string,
  contact: Contact | null | undefined
) {
  const fieldMap: Record<string, string> = {
    name: contact?.name || '',
    phone: contact?.phone || '',
    email: contact?.email || '',
    company: contact?.company || '',
  };

  return text.replace(
    /\{\{\s*(name|phone|email|company)\s*\}\}/gi,
    (_, raw) => {
      const key = String(raw).toLowerCase();
      return fieldMap[key] || '';
    }
  );
}
