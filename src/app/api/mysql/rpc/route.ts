import { getSession } from '@/lib/auth/session';
import { getAuthContext } from '@/lib/auth/service';
import { executeMysqlRpc } from '@/lib/mysql/rpc';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ data: null, error: { message: 'Unauthorized.' } }, { status: 401 });
  const auth = await getAuthContext(session.user.id);
  if (!auth) return Response.json({ data: null, error: { message: 'Account context not found.' } }, { status: 403 });
  const body = await request.json().catch(() => null) as { name?: string; args?: Record<string, unknown> } | null;
  if (!body?.name) return Response.json({ data: null, error: { message: 'Operation name is required.' } }, { status: 400 });
  return Response.json(await executeMysqlRpc(body.name, body.args ?? {}, { accountId: auth.account.id, userId: auth.user.id }));
}
