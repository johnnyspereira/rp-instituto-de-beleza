import { getSession } from '@/lib/auth/session';
import { getAuthContext } from '@/lib/auth/service';

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ session: null });

  const context = await getAuthContext(session.user.id);
  if (!context) return Response.json({ session: null });

  return Response.json({
    session: {
      ...context,
      expiresAt: session.expiresAt,
    },
  });
}
