import { AgendaPage } from '@/components/agenda/agenda-page';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    contact?: string;
    appointment?: string;
    date?: string;
    referral?: string;
    new?: string;
  }>;
}) {
  const {
    contact,
    appointment,
    date,
    referral,
    new: createNew,
  } = await searchParams;
  return (
    <AgendaPage
      initialContactId={contact ?? null}
      initialAppointmentId={appointment ?? null}
      initialDate={date ?? null}
      initialReferralId={referral ?? null}
      initialCreate={createNew === '1'}
    />
  );
}
