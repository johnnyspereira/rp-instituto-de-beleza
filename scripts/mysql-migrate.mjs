import 'dotenv/config.js';
import { config } from 'dotenv';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import mysql from 'mysql2/promise';

// Load .env.local explicitly
config({ path: '.env.local' });

const migrationsDirectory = path.resolve('mysql/migrations');
const databaseUrl = process.env.DATABASE_URL;

const connectionOptions = databaseUrl
  ? { uri: databaseUrl }
  : {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD ?? '',
      database: process.env.DB_NAME,
    };

if (
  !databaseUrl &&
  (!connectionOptions.host ||
    !connectionOptions.user ||
    !connectionOptions.database)
) {
  throw new Error(
    'Set DATABASE_URL or DB_HOST, DB_USER, DB_PASSWORD and DB_NAME.'
  );
}

const connection = await mysql.createConnection({
  ...connectionOptions,
  multipleStatements: true,
  charset: 'utf8mb4',
  timezone: 'Z',
});

try {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) NOT NULL PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  for (const name of files) {
    const sql = await readFile(path.join(migrationsDirectory, name), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const [existing] = await connection.execute(
      'SELECT checksum FROM schema_migrations WHERE name = ? LIMIT 1',
      [name]
    );

    if (existing.length > 0) {
      if (existing[0].checksum !== checksum) {
        throw new Error(`Migration ${name} changed after it was applied.`);
      }
      console.log(`skip  ${name}`);
      continue;
    }

    await connection.beginTransaction();
    try {
      // MySQL commits DDL implicitly. Execute one statement at a time so an
      // interrupted cPanel deploy can safely resume the same migration.
      const statements = sql
        .split(/;\s*(?:\r?\n|$)/)
        .map((statement) => statement.trim())
        .filter(Boolean);
      for (const statement of statements) {
        try {
          // Some cPanel databases still default to latin1. A child table whose
          // CHAR(36) columns inherit that default cannot reference our utf8mb4
          // identifiers in MariaDB. Normalize every InnoDB CREATE TABLE even
          // when an older migration omitted the explicit charset clause.
          const compatibleStatement = statement.replace(
            /\)\s+ENGINE=InnoDB(?!\s+DEFAULT\s+CHARSET)/i,
            ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
          );
          await connection.query(compatibleStatement);
        } catch (error) {
          const resumableDdlErrors = new Set([
            'ER_TABLE_EXISTS_ERROR',
            'ER_DUP_FIELDNAME',
            'ER_DUP_KEYNAME',
            'ER_FK_DUP_NAME',
          ]);
          if (!resumableDdlErrors.has(error?.code)) throw error;
          console.log(`resume ${name}: ${error.code}`);
        }
      }
      await connection.execute(
        'INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)',
        [name, checksum]
      );
      await connection.commit();
      console.log(`apply ${name}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }
} finally {
  await connection.end();
}
