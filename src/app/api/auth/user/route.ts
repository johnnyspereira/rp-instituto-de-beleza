import { getSession } from '@/lib/auth/session';
import { hashPassword } from '@/lib/auth/password';
import { mutate } from '@/lib/mysql/db';

export async function PATCH(request: Request) {
  const session = await getSession(); if (!session) return Response.json({ error: { message: 'Unauthorized.' } }, { status: 401 });
  const body = await request.json().catch(() => null) as { password?: string } | null;
  if (!body?.password || body.password.length < 8) return Response.json({ error: { message: 'A senha deve ter pelo menos 8 caracteres.' } }, { status: 400 });
  await mutate('UPDATE app_users SET password_hash=? WHERE id=?', [await hashPassword(body.password), session.user.id]);
  return Response.json({ data: { user: session.user }, error: null });
}
