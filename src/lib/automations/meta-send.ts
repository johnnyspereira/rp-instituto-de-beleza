import type { MessageTemplate } from '@/types';
import {
  interactivePayloadToText,
  type InteractiveMessagePayload,
} from '@/lib/whatsapp/interactive';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';
import { supabaseAdmin } from './admin-client';

// ------------------------------------------------------------
// Automation-side WhatsApp sender.
//
// Historical name: this file used to send through Meta Cloud API.
// In this installation the active transport is WhatsApp QR/Web, so the
// exported engine functions keep their names but deliver via Baileys.
// ------------------------------------------------------------

interface SendTextArgs {
  accountId: string;
  userId: string;
  conversationId: string;
  contactId: string;
  text: string;
}

interface SendTemplateArgs {
  accountId: string;
  userId: string;
  conversationId: string;
  contactId: string;
  templateName: string;
  language?: string;
  params?: string[];
}

interface SendInteractiveArgs {
  accountId: string;
  userId: string;
  conversationId: string;
  contactId: string;
  payload: InteractiveMessagePayload;
}

export async function engineSendText(
  args: SendTextArgs
): Promise<{ whatsapp_message_id: string }> {
  return sendViaQr(args);
}

export async function engineSendTemplate(
  args: SendTemplateArgs
): Promise<{ whatsapp_message_id: string }> {
  const text = await renderTemplateForQr(args);
  return sendViaQr({ ...args, text });
}

export async function engineSendInteractive(
  args: SendInteractiveArgs
): Promise<{ whatsapp_message_id: string }> {
  return sendViaQr({
    ...args,
    text: interactivePayloadToText(args.payload),
  });
}

async function sendViaQr(
  input: SendTextArgs
): Promise<{ whatsapp_message_id: string }> {
  await waitForQrConnection(input.accountId, input.userId);

  if (!remoteWhatsAppWorker.enabled()) {
    throw new Error('WHATSAPP_MODE deve ser remote_worker para enviar mensagens.');
  }
  const result = await remoteWhatsAppWorker.send({
    accountId: input.accountId,
    userId: input.userId,
    conversationId: input.conversationId,
    message: { text: input.text, contentType: 'text', senderType: 'bot' },
  });

  return { whatsapp_message_id: result.whatsappMessageId };
}

async function waitForQrConnection(accountId: string, userId: string) {
  if (remoteWhatsAppWorker.enabled()) {
    const status = await remoteWhatsAppWorker.status({
      accountId,
      userId,
      autoStart: true,
    });
    if (!status.connected) {
      throw new Error(
        status.lastError ||
          `WhatsApp QR session is not connected (state: ${status.state}).`
      );
    }
    return;
  }

  throw new Error('WHATSAPP_MODE deve ser remote_worker para enviar mensagens.');
}

function renderTemplateValue(
  value: string | undefined | null,
  params: string[]
) {
  return (value ?? '')
    .replace(/\{\{(\d+)\}\}/g, (_, raw) => {
      const idx = Number(raw) - 1;
      const replacement = params[idx];
      return replacement && replacement.trim() ? replacement : `{{${raw}}}`;
    })
    .trim();
}

function renderTemplateParts(
  template: MessageTemplate,
  params: string[]
): string {
  const parts = [
    template.header_type === 'text'
      ? renderTemplateValue(template.header_content, params)
      : '',
    renderTemplateValue(template.body_text, params),
    renderTemplateValue(template.footer_text, params),
  ].filter(Boolean);

  const buttonLabels = (template.buttons ?? [])
    .map((button) => button.text?.trim())
    .filter(Boolean);

  if (buttonLabels.length > 0) {
    parts.push(
      buttonLabels.map((label, index) => `${index + 1}. ${label}`).join('\n')
    );
  }

  return parts.join('\n\n').trim();
}

async function renderTemplateForQr(args: SendTemplateArgs): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .from('message_templates')
    .select('*')
    .eq('account_id', args.accountId)
    .eq('name', args.templateName)
    .eq('language', args.language || 'en_US')
    .maybeSingle();

  if (error) {
    throw new Error(`template lookup failed: ${error.message}`);
  }

  const template = data as MessageTemplate | null;
  if (!template?.body_text) {
    throw new Error(
      `template "${args.templateName}" was not found locally for QR send`
    );
  }

  return renderTemplateParts(template, args.params ?? []);
}
