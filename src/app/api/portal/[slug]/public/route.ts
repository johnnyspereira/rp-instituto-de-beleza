import { supabaseAdmin } from '@/lib/flows/admin-client';
import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const admin = supabaseAdmin();
  const { data: settings } = await admin
    .from('client_portal_settings')
    .select(
      'account_id,slug,enabled,welcome_title,welcome_message,booking_enabled,benefits_enabled,financial_enabled,profile_edit_enabled,referrals_enabled'
    )
    .ilike('slug', slug.trim())
    .eq('enabled', true)
    .maybeSingle();
  if (!settings)
    return Response.json({ error: 'Portal unavailable' }, { status: 404 });
  const { data: account } = await admin
    .from('accounts')
    .select('name,logo_url,default_currency')
    .eq('id', settings.account_id)
    .single();
  let whatsappRecovery = false;
  if (remoteWhatsAppWorker.enabled()) {
    try {
      const { data: config } = await admin
        .from('whatsapp_config')
        .select('user_id')
        .eq('account_id', settings.account_id)
        .maybeSingle();
      const userId =
        config?.user_id ||
        (await resolveAuditUserId(admin, settings.account_id));
      const status = await Promise.race([
        remoteWhatsAppWorker.status({
          accountId: settings.account_id,
          userId,
          autoStart: false,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('WhatsApp status timeout')),
            2_500
          )
        ),
      ]);
      whatsappRecovery = status.connected === true;
    } catch (error) {
      console.warn('[portal-public] WhatsApp status unavailable:', error);
    }
  }
  return Response.json({
    slug: settings.slug,
    business: account,
    welcomeTitle: settings.welcome_title,
    welcomeMessage: settings.welcome_message,
    features: {
      booking: settings.booking_enabled,
      benefits: settings.benefits_enabled,
      financial: settings.financial_enabled,
      profile: settings.profile_edit_enabled !== false,
      referrals: settings.referrals_enabled !== false,
      whatsappRecovery,
    },
  });
}
