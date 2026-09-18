import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { mutate } from '@/lib/mysql/db';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';
import {
  getPollingWorkerStatus,
  isPollingWorkerMode,
} from '@/lib/whatsapp/polling-worker';

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount();
    const { searchParams } = new URL(request.url);
    const autoStart = searchParams.get('autostart') !== 'false';
    if (isPollingWorkerMode()) {
      return NextResponse.json(await getPollingWorkerStatus(ctx.accountId));
    }
    if (remoteWhatsAppWorker.enabled()) {
      // Passenger can serve requests from more than one Node process. Keep
      // the database fallback in sync whenever this authenticated call sees
      // the current runtime secret, so worker callbacks are accepted by a
      // process that has not reloaded its environment yet.
      const secret = process.env['WHATSAPP_WORKER_SECRET']?.trim();
      if (secret) {
        await mutate(
          `INSERT INTO whatsapp_worker_credentials(account_id,secret_hash)
           VALUES(?,?) ON DUPLICATE KEY UPDATE secret_hash=VALUES(secret_hash)`,
          [
            ctx.accountId,
            createHash('sha256').update(secret).digest('hex'),
          ]
        );
      }
      const status = await remoteWhatsAppWorker.status({
        accountId: ctx.accountId,
        userId: ctx.userId,
        autoStart,
      });
      return NextResponse.json(status);
    }

    return NextResponse.json(
      { error: 'WhatsApp remoto não configurado. Defina WHATSAPP_MODE=remote_worker.' },
      { status: 503 }
    );

    const {
      bindBaileysSessionContext,
      getBaileysSessionStatus,
      startBaileysSession,
    } = await import('@/lib/whatsapp/baileys');

    bindBaileysSessionContext(ctx.accountId, ctx.userId);
    const status = autoStart
      ? await getBaileysSessionStatus()
      : await startBaileysSession({
          accountId: ctx.accountId,
          userId: ctx.userId,
          autoStart: true,
          restoreOnly: true,
        });

    if (autoStart && !status.connected) {
      const nextStatus = await startBaileysSession({
        accountId: ctx.accountId,
        userId: ctx.userId,
        autoStart,
      });
      return NextResponse.json(nextStatus);
    }

    return NextResponse.json(status);
  } catch (error) {
    return toErrorResponse(error);
  }
}
