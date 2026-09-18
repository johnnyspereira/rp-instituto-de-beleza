import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { brandedEmail } from '@/lib/email/templates';
import { sendLocalEmail } from '@/lib/email/smtp';
import { createClient } from '@/lib/supabase/server';
import { getPublicUrl } from '@/lib/public-url';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await createClient(); const { data: auth } = await session.auth.getUser();
  if (!auth.user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const { id } = await params; const db = supabaseAdmin();
  const { data: profile } = await db.from('profiles').select('account_id,account_role').eq('user_id', auth.user.id).maybeSingle();
  if (!profile || !['owner','admin','agent'].includes(profile.account_role)) return Response.json({ error: 'Sem permissão.' }, { status: 403 });
  const [{ data: campaign }, { data: account }, { data: contacts }] = await Promise.all([
    db.from('portal_campaigns').select('*').eq('id', id).eq('account_id', profile.account_id).eq('status', 'published').maybeSingle(),
    db.from('accounts').select('name,logo_url').eq('id', profile.account_id).maybeSingle(),
    db.from('contacts').select('id,name,email').eq('account_id', profile.account_id).eq('marketing_consent', true).not('email','is',null),
  ]);
  if (!campaign) return Response.json({ error: 'Publique a campanha antes de enviar.' }, { status: 400 });
  const { data: previous } = await db.from('campaign_email_deliveries').select('contact_id').eq('campaign_id', id);
  const sentTo = new Set((previous ?? []).map((row) => row.contact_id)); let sent = 0; let failed = 0;
  const url = getPublicUrl('/portal', new URL(request.url).origin);
  for (const contact of contacts ?? []) {
    if (!contact.email || sentTo.has(contact.id)) continue;
    try {
      const content = brandedEmail({ businessName: account?.name || 'RP Instituto de Beleza', logoUrl: account?.logo_url, eyebrow: 'Novidades', preheader: campaign.summary, title: campaign.title, greeting: `Olá, ${contact.name || 'cliente'}.`, message: campaign.description || campaign.summary, highlight: campaign.benefit_text ? { label: 'Benefício exclusivo', value: campaign.benefit_text } : null, action: { label: 'Ver campanha no Portal 360', url }, notice: 'Recebe esta comunicação porque autorizou marketing por email. Pode retirar a autorização no Portal 360.' });
      await sendLocalEmail({ to: contact.email, profile: 'marketing', subject: `${account?.name || 'RP Instituto de Beleza'} · ${campaign.title}`, text: `${campaign.summary}\n\n${url}`, html: content });
      await db.from('campaign_email_deliveries').insert({ id: randomUUID(), account_id: profile.account_id, campaign_id: id, contact_id: contact.id, recipient_email: contact.email, status: 'sent', sent_at: new Date().toISOString() }); sent++;
    } catch (error) { await db.from('campaign_email_deliveries').upsert({ id: randomUUID(), account_id: profile.account_id, campaign_id: id, contact_id: contact.id, recipient_email: contact.email, status: 'failed', error_message: error instanceof Error ? error.message : 'Falha no email.' }, { onConflict: 'campaign_id,contact_id' }); failed++; }
  }
  return Response.json({ sent, failed, skipped: sentTo.size });
}
