import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';
import {
  enqueueWorkerCommand,
  getPollingWorkerStatus,
  isPollingWorkerMode,
} from '@/lib/whatsapp/polling-worker';

export async function POST() {
  try {
    const ctx = await requireRole('admin');
    if (isPollingWorkerMode()) {
      await enqueueWorkerCommand(ctx.accountId, 'restart');
      return NextResponse.json({
        success: true,
        queued: true,
        status: await getPollingWorkerStatus(ctx.accountId),
      });
    }
    if (remoteWhatsAppWorker.enabled()) {
      const result = await remoteWhatsAppWorker.restart({
        accountId: ctx.accountId,
        userId: ctx.userId,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: 'WhatsApp remoto não configurado. Defina WHATSAPP_MODE=remote_worker.' },
      { status: 503 }
    );

    const { bindBaileysSessionContext, restartBaileysSession } =
      await import('@/lib/whatsapp/baileys');

    bindBaileysSessionContext(ctx.accountId, ctx.userId);
    const status = await restartBaileysSession();
    return NextResponse.json({ success: true, status });
  } catch (error) {
    return toErrorResponse(error);
  }
}
