import type { Metadata } from 'next';

import { PublicAnamnesis } from '@/components/clinic/public-anamnesis';
import { defaultAnamnesisSlug } from '@/lib/portal/public-routes';

export const metadata: Metadata = {
  title: 'Ficha de anamnese',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function FriendlyAnamnesisPage() {
  const slug = await defaultAnamnesisSlug();
  return <PublicAnamnesis publicSlug={slug || ''} />;
}
