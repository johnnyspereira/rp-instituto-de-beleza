import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { brandedEmail } from '@/lib/email/templates';
import { emailDeliveryConfiguration, sendLocalEmail } from '@/lib/email/smtp';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export const runtime = 'nodejs';

async function defaultRecipient(accountId: string) {
  const { data } = await supabaseAdmin()
    .from('privacy_settings')
    .select('controller_email')
    .eq('account_id', accountId)
    .maybeSingle();
  return data?.controller_email || 'geral@rp-instituto.example';
}

export async function GET() {
  try {
    const ctx = await requireRole('admin');
    return Response.json({
      ...emailDeliveryConfiguration(),
      defaultRecipient: await defaultRecipient(ctx.accountId),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as {
      email?: string;
    } | null;
    const email =
      body?.email?.trim().toLowerCase() ||
      (await defaultRecipient(ctx.accountId));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json(
        { error: 'Indique um email válido.' },
        { status: 400 }
      );
    }

    const configuration = emailDeliveryConfiguration();
    const content = brandedEmail({
      businessName: 'RP Instituto de Beleza',
      preheader: 'Teste de entrega do CRM RP Instituto de Beleza',
      eyebrow: 'Diagnóstico',
      title: 'O envio de email está operacional',
      greeting: 'Olá,',
      message:
        'Esta mensagem confirma que o CRM conseguiu entregar um email ao servidor configurado.',
      details: [
        { label: 'Método', value: configuration.transport.toUpperCase() },
        { label: 'Remetente', value: configuration.sender },
        { label: 'Data do teste', value: new Date().toLocaleString('pt-PT') },
      ],
      notice:
        'Se recebeu esta mensagem, os emails do portal, agenda, packs e vouchers usam o mesmo serviço de entrega.',
    });
    const result = await sendLocalEmail({
      to: email,
      subject: 'Teste de email — RP Instituto de Beleza CRM',
      text: 'Teste concluído: o CRM RP Instituto de Beleza conseguiu entregar esta mensagem ao servidor de email.',
      html: content,
    });
    return Response.json({
      sent: true,
      recipient: email,
      messageId: result.messageId,
      configuration,
    });
  } catch (error) {
    console.error('[email-diagnostics] test failed:', error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Falha no teste de email.',
        configuration: emailDeliveryConfiguration(),
      },
      { status: 502 }
    );
  }
}
