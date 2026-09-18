import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const applicationRoot = process.cwd();

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: applicationRoot,
      env: process.env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `${command} ${args.join(' ')} failed (${signal ?? `exit ${code}`}).`
          )
        );
      }
    });
  });
}

console.log('Applying MySQL migrations...');
await run(process.execPath, [
  path.join(applicationRoot, 'scripts/mysql-migrate.mjs'),
]);

console.log('Building the Next.js application for cPanel...');
await run(process.execPath, [
  path.join(applicationRoot, 'node_modules/next/dist/bin/next'),
  'build',
  '--webpack',
]);

console.log('cPanel deployment completed successfully.');
