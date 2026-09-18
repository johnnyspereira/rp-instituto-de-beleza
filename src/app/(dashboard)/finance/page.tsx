import { FinancePage } from '@/components/finance/finance-page';
import { redirect } from 'next/navigation';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    contact?: string;
    appointment?: string;
    tab?: string;
  }>;
}) {
  const { contact, appointment, tab } = await searchParams;
  if (tab === 'treasury') redirect('/private-management');
  return (
    <FinancePage
      initialContactId={contact}
      initialAppointmentId={appointment}
      initialTab={tab}
    />
  );
}
