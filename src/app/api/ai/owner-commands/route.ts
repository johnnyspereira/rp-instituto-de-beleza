import { NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { mutate, selectRows } from '@/lib/mysql/db';

const phoneKey = (value: string) => value.replace(/\D/g, '');

export async function GET() {
  try {
    const { accountId } = await getCurrentAccount();
    const rows = await selectRows<(RowDataPacket & { enabled: number; authorized_phone: string; timezone: string })[]>(
      'SELECT enabled,authorized_phone,timezone FROM ai_owner_command_settings WHERE account_id=? LIMIT 1', [accountId]
    );
    const setting = rows[0];
    return NextResponse.json({ enabled: Boolean(setting?.enabled), authorized_phone: setting?.authorized_phone ?? '', timezone: setting?.timezone ?? 'Europe/Lisbon' });
  } catch (error) { return toErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { accountId, userId } = await requireRole('admin');
    const body = await request.json().catch(() => null);
    const rawPhone = typeof body?.authorized_phone === 'string' ? body.authorized_phone.trim() : '';
    const normalized = phoneKey(rawPhone);
    if (!/^\d{8,15}$/.test(normalized)) return NextResponse.json({ error: 'Indique um número de WhatsApp válido com indicativo do país.' }, { status: 400 });
    const enabled = body?.enabled === true;
    await mutate(
      `INSERT INTO ai_owner_command_settings(account_id,enabled,authorized_phone,timezone,updated_by_user_id)
       VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),authorized_phone=VALUES(authorized_phone),timezone=VALUES(timezone),updated_by_user_id=VALUES(updated_by_user_id)`,
      [accountId, enabled, normalized, 'Europe/Lisbon', userId]
    );
    return NextResponse.json({ success: true, enabled, authorized_phone: normalized });
  } catch (error) { return toErrorResponse(error); }
}
