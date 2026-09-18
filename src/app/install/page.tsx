import { redirect } from 'next/navigation';
import { selectRows } from '@/lib/mysql/db';
import type { RowDataPacket } from 'mysql2';
import { InstallForm } from './install-form';

// Offer setup only while no administrator exists in this installation.
export default async function InstallPage({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  const rows = await selectRows<(RowDataPacket & { total: number })[]>(
    'SELECT COUNT(*) AS total FROM app_users'
  );
  if (Number(rows[0]?.total ?? 0) > 0) redirect('/login');
  const { error } = await searchParams;
  return <InstallForm error={error} />;
}
