import type { Metadata } from 'next';

import { PublicAnamnesis } from '@/components/clinic/public-anamnesis';

export const metadata: Metadata = {
  title: 'Ficha de anamnese',
  robots: { index: false, follow: false },
};

export default async function AnamnesisPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicAnamnesis token={token} />;
}
