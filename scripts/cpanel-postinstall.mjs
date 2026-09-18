import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const applicationRoot = path.resolve(process.env.INIT_CWD || process.cwd());

if (process.env.CPANEL_DEPLOY !== 'true') {
  console.log('skip cPanel deployment (CPANEL_DEPLOY is not true)');
  process.exit(0);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: process.env,
      cwd: applicationRoot,
      shell: process.platform === 'win32',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? code}).`));
    });
  });
}

console.log('cPanel: applying MySQL migrations...');
await run(process.execPath, [path.join(applicationRoot, 'scripts/mysql-migrate.mjs')]);

console.log('cPanel: building the Next.js production application...');
await run(process.execPath, [
  path.join(applicationRoot, 'node_modules/next/dist/bin/next'),
  'build',
  '--webpack',
]);

console.log('cPanel deployment completed successfully.');
