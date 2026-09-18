import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export type StoredPushSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function pushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
  );
}

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey)
    throw new Error('VAPID keys are not configured');
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    publicKey,
    privateKey
  );
}

export async function sendPush(
  subscriptions: StoredPushSubscription[],
  payload: { title: string; body?: string | null; url: string; tag?: string }
) {
  if (!subscriptions.length || !pushConfigured()) return;
  configureWebPush();
  const admin = supabaseAdmin();
  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload)
        );
        await admin
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', subscription.id);
      } catch (error) {
        const statusCode =
          typeof error === 'object' && error && 'statusCode' in error
            ? Number(error.statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          await admin
            .from('push_subscriptions')
            .delete()
            .eq('id', subscription.id);
          return;
        }
        throw error;
      }
    })
  );
}
