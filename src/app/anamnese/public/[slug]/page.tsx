import type { Metadata } from 'next';

import { PublicAnamnesis } from '@/components/clinic/public-anamnesis';

export const metadata: Metadata = {
  title: 'Ficha de anamnese',
  robots: { index: false, follow: false },
};

export default async function PublicAnamnesisPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PublicAnamnesis publicSlug={slug} />;
}
