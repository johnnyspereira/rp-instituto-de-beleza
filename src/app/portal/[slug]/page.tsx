import type { Metadata } from 'next';
import { ClientPortal } from '@/components/portal/client-portal';

export const metadata: Metadata = {
  title: 'Portal do cliente',
  robots: { index: false, follow: false },
};

export default async function ClientPortalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ClientPortal slug={slug} />;
}
