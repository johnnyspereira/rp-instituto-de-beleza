import { getSession } from '@/lib/auth/session';
import { getAuthContext } from '@/lib/auth/service';
import { selectRows } from '@/lib/mysql/db';
import type { RowDataPacket } from 'mysql2';

type Connection = RowDataPacket & {
  connected_at: Date;
  google_account_name: string | null;
};

export async function GET() {
  const session = await getSession();
  const auth = session ? await getAuthContext(session.user.id) : null;
  if (!auth || auth.profile.account_role !== 'owner') {
    return Response.json({ error: 'Sem autorização.' }, { status: 403 });
  }

  const [connection] = await selectRows<Connection[]>(
    `SELECT connected_at, google_account_name
       FROM google_business_profile_connections
      WHERE account_id=?
      LIMIT 1`,
    [auth.account.id],
  );

  return Response.json({
    connected: Boolean(connection),
    connectedAt: connection?.connected_at?.toISOString() ?? null,
    googleAccountName: connection?.google_account_name ?? null,
  });
}
