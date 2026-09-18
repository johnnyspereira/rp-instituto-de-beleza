# PWA and Web Push

The CRM and Portal 360 register `/sw.js`, can be installed on the Home Screen,
and store device subscriptions in `push_subscriptions` (migration 081).

## Environment

Generate a VAPID key pair with `npx web-push generate-vapid-keys` and configure:

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@example.com
PUSH_WEBHOOK_SECRET=...
```

Web Push requires HTTPS (localhost is the only HTTP exception). Apply migration
081 before enabling notifications.

## Supabase Database Webhooks

Create two `INSERT` webhooks in Supabase → Database → Webhooks:

- Table `notifications`
- Table `portal_notifications`

Both webhooks call `https://YOUR_CRM/api/push/dispatch` with the HTTP header
`x-push-secret` equal to `PUSH_WEBHOOK_SECRET`. The endpoint accepts Supabase's
standard `{ table, record }` payload and sends only to the user/contact named by
that row.

On iPhone/iPad, first add the site to the Home Screen, open the installed app,
then press **Ativar notificações**. On Android the install and notification
buttons are available directly in a supported browser.
