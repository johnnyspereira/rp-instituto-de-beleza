import type { Metadata } from 'next';

import { ClientPortal } from '@/components/portal/client-portal';
import { defaultPortalSlug } from '@/lib/portal/public-routes';

export const metadata: Metadata = {
  title: 'Portal do cliente',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function FriendlyClientPortalPage() {
  const slug = await defaultPortalSlug();
  return <ClientPortal slug={slug || ''} />;
}
