import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';
import {
  enqueueWorkerCommand,
  isPollingWorkerMode,
} from '@/lib/whatsapp/polling-worker';

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount();

    const body = await request.json().catch(() => ({}));
    const chatLimit =
      typeof body.chat_limit === 'number' ? body.chat_limit : undefined;
    const messageLimit =
      typeof body.message_limit === 'number' ? body.message_limit : undefined;
    const conversationId =
      typeof body.conversation_id === 'string' && body.conversation_id.trim()
        ? body.conversation_id.trim()
        : undefined;

    if (isPollingWorkerMode()) {
      await enqueueWorkerCommand(ctx.accountId, 'sync', {
        chatLimit,
        messageLimit,
        conversationId,
      });
      return NextResponse.json({ success: true, queued: true });
    }

    if (remoteWhatsAppWorker.enabled()) {
      const result = await remoteWhatsAppWorker.sync({
        accountId: ctx.accountId,
        userId: ctx.userId,
        chatLimit,
        messageLimit,
        conversationId,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: 'WhatsApp remoto não configurado. Defina WHATSAPP_MODE=remote_worker.' },
      { status: 503 }
    );

    const {
      bindBaileysSessionContext,
      startBaileysSession,
      syncBaileysHistory,
    } = await import('@/lib/whatsapp/baileys');

    bindBaileysSessionContext(ctx.accountId, ctx.userId);

    const status = await startBaileysSession({
      accountId: ctx.accountId,
      userId: ctx.userId,
      autoStart: true,
    });

    if (!status.connected) {
      return NextResponse.json(
        { error: 'WhatsApp QR session is not connected.', status },
        { status: 400 }
      );
    }

    const result = await syncBaileysHistory({ chatLimit, messageLimit });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return toErrorResponse(error);
  }
}
