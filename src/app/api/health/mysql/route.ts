import { selectRows } from '@/lib/mysql/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const configured = (name: string) => Boolean(process.env[name]?.trim());

/**
 * Temporary operational diagnostic. It deliberately reports only whether
 * settings exist; it never returns credentials, database names or hosts.
 */
export async function GET() {
  const environment = {
    databaseUrl: configured('DATABASE_URL'),
    host: configured('DB_HOST'),
    port: configured('DB_PORT'),
    name: configured('DB_NAME'),
    user: configured('DB_USER'),
    password: configured('DB_PASSWORD'),
  };

  try {
    await selectRows('SELECT 1 AS mysql_ok');
    return Response.json(
      { environment, mysql: 'connected' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return Response.json(
      {
        environment,
        mysql: 'unavailable',
        error: error instanceof Error ? error.message : 'Unknown MySQL error.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
