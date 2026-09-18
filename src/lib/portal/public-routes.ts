import 'server-only';

import { supabaseAdmin } from '@/lib/flows/admin-client';

export async function defaultPortalSlug() {
  const { data } = await supabaseAdmin()
    .from('client_portal_settings')
    .select('slug')
    .eq('enabled', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.slug?.trim() || null;
}

export async function defaultAnamnesisSlug() {
  const { data } = await supabaseAdmin()
    .from('clinic_communication_settings')
    .select('anamnesis_public_slug')
    .eq('anamnesis_enabled', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.anamnesis_public_slug?.trim() || null;
}
