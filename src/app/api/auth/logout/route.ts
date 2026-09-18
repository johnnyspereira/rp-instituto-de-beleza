import { deleteSession, getSession } from '@/lib/auth/session';
import { mutate } from '@/lib/mysql/db';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ ok: true });

  const body = (await request.json().catch(() => null)) as {
    all?: unknown;
  } | null;
  if (body?.all === true) {
    await mutate('DELETE FROM app_sessions WHERE user_id = ?', [
      session.user.id,
    ]);
  }
  await deleteSession();
  return Response.json({ ok: true });
}
