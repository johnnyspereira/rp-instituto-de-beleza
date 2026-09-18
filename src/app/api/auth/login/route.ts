import { authenticateUser } from '@/lib/auth/service';
import { createSession } from '@/lib/auth/session';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
  } | null;

  if (typeof body?.email !== 'string' || typeof body.password !== 'string') {
    return Response.json(
      { error: 'Email and password are required.' },
      { status: 400 }
    );
  }

  const user = await authenticateUser(body.email, body.password);
  if (!user) {
    return Response.json(
      { error: 'Invalid email or password.' },
      { status: 401 }
    );
  }

  await createSession(user.id);
  return Response.json({ user: { id: user.id, email: user.email } });
}
