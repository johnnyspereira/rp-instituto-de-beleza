import { pushConfigured } from '@/lib/push/server';

export async function GET() {
  if (!pushConfigured()) {
    return Response.json({ error: 'Push não configurado.' }, { status: 503 });
  }
  return Response.json({ publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY });
}
