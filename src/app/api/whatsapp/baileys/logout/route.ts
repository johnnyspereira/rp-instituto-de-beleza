import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';
import {
  enqueueWorkerCommand,
  isPollingWorkerMode,
} from '@/lib/whatsapp/polling-worker';

export async function POST() {
  try {
    const ctx = await requireRole('admin');
    if (isPollingWorkerMode()) {
      await enqueueWorkerCommand(ctx.accountId, 'logout');
      return NextResponse.json({ success: true, queued: true });
    }
    if (remoteWhatsAppWorker.enabled()) {
      const result = await remoteWhatsAppWorker.logout({
        accountId: ctx.accountId,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: 'WhatsApp remoto não configurado. Defina WHATSAPP_MODE=remote_worker.' },
      { status: 503 }
    );

    const { bindBaileysSessionContext, stopBaileysSession } =
      await import('@/lib/whatsapp/baileys');

    bindBaileysSessionContext(ctx.accountId, ctx.userId);
    await stopBaileysSession(true);
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
