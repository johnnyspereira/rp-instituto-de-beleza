import { createHash } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { selectRows } from '@/lib/mysql/db';

/**
 * Authenticated, non-secret diagnostic for the QR worker connection.
 * It deliberately returns only a short SHA-256 fingerprint, never the
 * configured secret itself.
 */
export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const runtimeSecret = process.env['WHATSAPP_WORKER_SECRET']?.trim() ?? '';
    const runtimeHash = runtimeSecret
      ? createHash('sha256').update(runtimeSecret).digest('hex')
      : null;
    const rows = await selectRows<
      (RowDataPacket & { secret_hash: string })[]
    >(
      'SELECT secret_hash FROM whatsapp_worker_credentials WHERE account_id=? LIMIT 1',
      [ctx.accountId]
    );
    const storedHash = rows[0]?.secret_hash ?? null;

    return NextResponse.json({
      runtimeSecretConfigured: Boolean(runtimeSecret),
      databaseCredentialConfigured: Boolean(storedHash),
      runtimeMatchesDatabase: Boolean(
        runtimeHash && storedHash && runtimeHash === storedHash
      ),
      // A fingerprint helps compare the running cPanel process with the
      // worker without disclosing a reusable credential.
      runtimeFingerprint: runtimeHash?.slice(0, 12) ?? null,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
