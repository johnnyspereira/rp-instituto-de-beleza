import { supabaseAdmin } from '@/lib/automations/admin-client';
import { getPublicUrl } from '@/lib/public-url';
import { createClient } from '@/lib/supabase/server';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';

export async function POST(request: Request) {
  const session = await createClient();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user)
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const db = supabaseAdmin();
  const { data: profile } = await db
    .from('profiles')
    .select('account_id,account_role')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!profile || !['owner', 'admin'].includes(profile.account_role))
    return Response.json({ error: 'Sem permissão.' }, { status: 403 });

  const { data: settings } = await db
    .from('finance_reminder_settings')
    .select('whatsapp_enabled,whatsapp_phone')
    .eq('account_id', profile.account_id)
    .maybeSingle();
  if (!settings?.whatsapp_enabled || !settings.whatsapp_phone)
    return Response.json(
      { error: 'Ative o WhatsApp e guarde um número válido primeiro.' },
      { status: 400 }
    );

  try {
    // Load the MySQL-backed WhatsApp queue only for this request. If the
    // cPanel runtime lacks its database configuration, the catch below can
    // return a useful error instead of the route failing at module load.
    const { resolveConversationByPhone } = await import(
      '@/lib/whatsapp/resolve-conversation'
    );
    const { conversationId } = await resolveConversationByPhone(
      db,
      profile.account_id,
      settings.whatsapp_phone,
      'Alertas financeiros'
    );
    const financeUrl = getPublicUrl('/finance', new URL(request.url).origin);
    const testMessage = `Teste dos alertas financeiros\n\nA ligação entre o Centro Financeiro e o WhatsApp está operacional.\n\nAbrir o financeiro: ${financeUrl}`;
    if (!remoteWhatsAppWorker.enabled()) {
      return Response.json(
        { error: 'O worker remoto do WhatsApp não está configurado no cPanel.' },
        { status: 503 }
      );
    }
    const sent = await remoteWhatsAppWorker.send({
      accountId: profile.account_id,
      userId: auth.user.id,
      conversationId,
      message: {
        contentType: 'text',
        text: testMessage,
        senderType: 'bot',
      },
    });
    return Response.json({
      ok: true,
      deliveredToWorker: true,
      recipient: settings.whatsapp_phone,
      messageId: sent.messageId,
      testedAt: new Date().toISOString(),
    });

    /* Direct delivery is deliberately disabled here: the connected worker
       polls the durable outbox, avoiding CRM-to-worker network failures. */
    /* const sent = await engineSendText({
      accountId: profile.account_id,
      userId: auth.user.id,
      conversationId,
      contactId,
      text: `✅ *Teste dos alertas financeiros*\n\nA ligação entre o Centro Financeiro e o WhatsApp está operacional.\n\nAbrir o financeiro: ${financeUrl}`,
        });
    return Response.json({
      ok: true,
      recipient: settings.whatsapp_phone,
      messageId: sent.whatsapp_message_id,
      testedAt: new Date().toISOString(),
    });
    */
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    console.error('[finance-reminder-test]', error);
    return Response.json({ error }, { status: 502 });
  }
}
