import { Client360Page } from '@/components/contacts/client-360-page';

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { edit, tab } = await searchParams;
  const allowedTabs = [
    'overview',
    'profile',
    'appointments',
    'commercial',
    'benefits',
    'finance',
    'referrals',
    'history',
  ] as const;
  const requestedTab = edit === '1' ? 'profile' : tab;
  const initialTab = allowedTabs.includes(
    requestedTab as (typeof allowedTabs)[number]
  )
    ? (requestedTab as (typeof allowedTabs)[number])
    : 'overview';
  return <Client360Page contactId={id} initialTab={initialTab} />;
}
