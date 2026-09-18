import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export const metadata: Metadata = {
  title: 'Política de privacidade | RP Instituto de Beleza',
};

export default async function PublicPrivacyPage() {
  const { data: portal } = await supabaseAdmin()
    .from('client_portal_settings')
    .select('slug')
    .limit(1)
    .maybeSingle();

  if (!portal?.slug) notFound();
  redirect(`/privacy/${encodeURIComponent(portal.slug)}`);
}
