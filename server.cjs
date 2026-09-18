const { createServer } = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');
const next = require('next');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '3000', 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

let server;
let financeReminderTimer;

function buildProductionAssets() {
  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.CPANEL_BUILD_ON_START !== 'true'
  ) {
    return Promise.resolve();
  }

  console.log('Building Next.js assets before starting the CRM...');
  return new Promise((resolve, reject) => {
    const build = spawn(
      process.execPath,
      [
        path.join(process.cwd(), 'node_modules/next/dist/bin/next'),
        'build',
        '--webpack',
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: 'inherit',
      }
    );

    build.once('error', reject);
    build.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Next.js build failed before startup (${signal ?? `exit ${code}`}).`
          )
        );
    });
  });
}

function applyMysqlMigrations() {
  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.CPANEL_AUTO_MIGRATE_ON_START !== 'true'
  ) {
    return Promise.resolve();
  }

  console.log('Applying pending MySQL migrations before starting the CRM...');
  return new Promise((resolve, reject) => {
    const migration = spawn(
      process.execPath,
      [path.join(process.cwd(), 'scripts/mysql-migrate.mjs')],
      { cwd: process.cwd(), env: process.env, stdio: 'inherit' }
    );
    migration.once('error', reject);
    migration.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`MySQL migration failed before startup (${signal ?? `exit ${code}`}).`));
    });
  });
}

function startFinanceReminderScheduler() {
  const secret = process.env.AUTOMATION_CRON_SECRET;
  if (!secret) {
    console.warn(
      'Finance reminders disabled: AUTOMATION_CRON_SECRET is not configured.'
    );
    return;
  }

  const run = async () => {
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/finance/reminders/process`,
        { headers: { 'x-cron-secret': secret } }
      );
      if (!response.ok) {
        console.error(
          `Finance reminder cycle failed (${response.status}):`,
          await response.text()
        );
      }
    } catch (error) {
      console.error('Finance reminder cycle failed:', error);
    }
  };

  setTimeout(() => void run(), 15_000).unref();
  financeReminderTimer = setInterval(() => void run(), 5 * 60_000);
  financeReminderTimer.unref();
  console.log('Finance reminder scheduler active (every 5 minutes).');
}

async function start() {
  // cPanel's Passenger process must remain lightweight. Builds and schema
  // changes belong to the deployment hook, not every application restart.
  // The explicit *_ON_START flags remain available for controlled recovery.
  await applyMysqlMigrations();
  await buildProductionAssets();
  await app.prepare();

  server = createServer((request, response) => {
    handle(request, response).catch((error) => {
      console.error('Request failed:', error);
      if (!response.headersSent) response.statusCode = 500;
      response.end('Internal server error');
    });
  });

  server.listen(port, hostname, () => {
    console.log(`CRM running on http://${hostname}:${port}`);
    startFinanceReminderScheduler();
  });
}

async function shutdown(signal) {
  console.log(`${signal} received. Closing CRM server.`);
  if (financeReminderTimer) clearInterval(financeReminderTimer);
  if (!server) process.exit(0);

  server.close(async () => {
    try {
      await app.close();
    } finally {
      process.exit(0);
    }
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

start().catch((error) => {
  console.error('CRM startup failed:', error);
  process.exit(1);
});
