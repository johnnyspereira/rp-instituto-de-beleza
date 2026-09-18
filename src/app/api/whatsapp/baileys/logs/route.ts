import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    if (!remoteWhatsAppWorker.enabled()) {
      return NextResponse.json({ events: [] });
    }
    return NextResponse.json(await remoteWhatsAppWorker.logs({ accountId: ctx.accountId }));
  } catch (error) {
    return toErrorResponse(error);
  }
}
