import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const applicationRoot = process.cwd();
const deploymentDirectory = path.join(applicationRoot, 'deployment');
const archive = path.join(deploymentDirectory, 'cpanel-next-build.tar.gz');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: applicationRoot,
      env: process.env,
      stdio: 'inherit',
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

console.log('Building the Next.js application locally...');
await run(process.execPath, [
  path.join(applicationRoot, 'node_modules/next/dist/bin/next'),
  'build',
  '--webpack',
]);

await mkdir(deploymentDirectory, { recursive: true });
await rm(archive, { force: true });

console.log('Creating the cPanel build archive...');
await run('tar', [
  '-czf',
  archive,
  '--exclude=.next/cache',
  '--exclude=.next/diagnostics',
  '--exclude=.next/standalone',
  '.next',
]);

console.log(`cPanel build archive created at ${archive}.`);
