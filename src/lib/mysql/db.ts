import 'server-only';

import mysql, {
  type ExecuteValues,
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from 'mysql2/promise';

const globalForMysql = globalThis as typeof globalThis & {
  mysqlPool?: Pool;
};

function createMysqlPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    return mysql.createPool({
      uri: databaseUrl,
      connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      charset: 'utf8mb4',
    });
  }

  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const database = process.env.DB_NAME;

  if (!host || !user || !database) {
    throw new Error(
      'MySQL is not configured. Set DATABASE_URL or DB_HOST, DB_PORT, DB_USER, DB_PASSWORD and DB_NAME.'
    );
  }

  return mysql.createPool({
    host,
    port: Number(process.env.DB_PORT ?? 3306),
    user,
    password: process.env.DB_PASSWORD ?? '',
    database,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    charset: 'utf8mb4',
    timezone: 'Z',
  });
}

export function db(): Pool {
  if (!globalForMysql.mysqlPool) {
    globalForMysql.mysqlPool = createMysqlPool();
  }

  return globalForMysql.mysqlPool;
}

export async function selectRows<T extends RowDataPacket[]>(
  sql: string,
  values: ExecuteValues[] = []
): Promise<T> {
  const [rows] = await db().execute<T>(sql, values);
  return rows;
}

export async function mutate(
  sql: string,
  values: ExecuteValues[] = []
): Promise<ResultSetHeader> {
  const [result] = await db().execute<ResultSetHeader>(sql, values);
  return result;
}

export async function transaction<T>(
  work: (connection: PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await db().getConnection();

  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
