import { selectRows, mutate } from '@/lib/mysql/db';
import type { RowDataPacket } from 'mysql2';

type ReviewRow = RowDataPacket & { id: string; submitted_at: Date | null; service_name: string | null; business_name: string | null };
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rows = await selectRows<ReviewRow[]>(`SELECT r.id,r.submitted_at,s.name service_name,a.name business_name FROM clinic_appointment_reviews r JOIN clinic_appointments p ON p.id=r.appointment_id JOIN accounts a ON a.id=r.account_id LEFT JOIN clinic_services s ON s.id=p.service_id WHERE r.public_token=? LIMIT 1`, [token]);
  const row = rows[0];
  if (!row) return Response.json({ error: 'Link inv\u00e1lido.' }, { status: 404 });
  return Response.json({ submitted: !!row.submitted_at, serviceName: row.service_name, businessName: row.business_name });
}
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const body = await request.json().catch(() => null);
  const rating = Number(body?.rating); const comment = typeof body?.comment === 'string' ? body.comment.trim().slice(0, 2000) : null;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return Response.json({ error: 'Escolha uma nota de 1 a 5.' }, { status: 400 });
  await mutate('UPDATE clinic_appointment_reviews SET rating=?,comment=?,consent_to_publish=?,submitted_at=UTC_TIMESTAMP(3) WHERE public_token=? AND submitted_at IS NULL', [rating, comment || null, body?.consentToPublish === true, token]);
  return Response.json({ success: true });
}
