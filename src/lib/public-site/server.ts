import { cache } from 'react';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';
import type { PublicSiteSettings } from './types';
import { selectRows } from '@/lib/mysql/db';
import type { RowDataPacket } from 'mysql2';
export const getPublicBusinessSite = cache(async (slug: string) => {
  const admin = supabaseAdmin();
  const { data: settings, error } = await admin
    .from('public_site_settings')
    .select('*')
    .ilike('slug', slug.trim())
    .eq('enabled', true)
    .maybeSingle();
  if (error || !settings) return null;
  const [account, services, team, portal, whatsappConfig, reviews, importedGoogleReviews] = await Promise.all([
    admin
      .from('accounts')
      .select('id,name,logo_url,default_currency')
      .eq('id', settings.account_id)
      .single(),
    admin
      .from('clinic_services')
      .select('id,name,description,public_presentation,public_benefits,public_considerations,public_image_url,duration_minutes,price,currency,color,coming_soon')
      .eq('account_id', settings.account_id)
      .eq('is_active', true)
      .eq('online_enabled', true)
      .eq('show_on_site', true)
      .order('name')
      .limit(24),
    admin
      .from('profiles')
      .select(
        'id,full_name,avatar_url,professional_title,professional_bio,professional_color,professional_public_slug,working_hours'
      )
      .eq('account_id', settings.account_id)
      .eq('is_professional', true)
      .eq('professional_show_online', true)
      .order('full_name')
      .limit(24),
    admin
      .from('client_portal_settings')
      .select('slug,enabled,booking_enabled')
      .eq('account_id', settings.account_id)
      .maybeSingle(),
    admin
      .from('whatsapp_config')
      .select('status,user_id')
      .eq('account_id', settings.account_id)
      .maybeSingle(),
    admin
      .from('clinic_appointment_reviews')
      .select('rating,comment,submitted_at,contact:contacts(name),appointment:clinic_appointments(service:clinic_services(name))')
      .eq('account_id', settings.account_id)
      .not('published_at', 'is', null)
      .eq('consent_to_publish', true)
      .order('published_at', { ascending: false })
      .limit(6),
    selectRows<(RowDataPacket & { rating: number; comment: string | null; reviewer_name: string | null; reviewed_at: Date | null })[]>(`SELECT rating,comment,reviewer_name,reviewed_at FROM google_business_profile_reviews WHERE account_id=? AND approved=TRUE AND TRIM(COALESCE(comment,''))<>'' ORDER BY reviewed_at DESC LIMIT 12`, [settings.account_id]),
  ]);
  if (account.error) return null;
  let whatsappConnected = whatsappConfig.data?.status === 'connected';
  if (remoteWhatsAppWorker.enabled()) {
    try {
      const status = await Promise.race([
        remoteWhatsAppWorker.status({ accountId: settings.account_id, userId: whatsappConfig.data?.user_id || await resolveAuditUserId(admin, settings.account_id), autoStart: false }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1_200)),
      ]);
      whatsappConnected = status.connected === true;
    } catch { whatsappConnected = false; }
  }
  return {
    settings: settings as PublicSiteSettings,
    account: account.data,
    services: services.data ?? [],
    team: team.data ?? [],
    portal: portal.data?.enabled ? portal.data : null,
    reviews: reviews.data ?? [],
    googleReviews: (settings as PublicSiteSettings).google_reviews_enabled
      ? importedGoogleReviews.map((review) => ({ rating: Number(review.rating), comment: review.comment ?? '', name: review.reviewer_name || 'Cliente Google', publishedAt: review.reviewed_at?.toISOString() ?? null, mapsUrl: null }))
      : [],
    googleMapsUrl: (settings as PublicSiteSettings).google_review_url || null,
    whatsappConnected,
  };
});

export const getDefaultPublicBusinessSlug = cache(async () => {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('public_site_settings')
    .select('slug')
    .eq('enabled', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.slug || null;
});
