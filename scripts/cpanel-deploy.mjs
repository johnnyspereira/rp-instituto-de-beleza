import { spawn } from 'node:child_process';
import { access, rm } from 'node:fs/promises';
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

const buildArchive = path.join(
  applicationRoot,
  'deployment',
  'cpanel-next-build.tar.gz'
);

const prebuiltApplicationExists = await access(buildArchive)
  .then(() => true)
  .catch((error) => {
    if (error?.code === 'ENOENT') return false;
    throw error;
  });

if (prebuiltApplicationExists) {
  console.log('Installing the prebuilt Next.js application for cPanel...');
  await rm(path.join(applicationRoot, '.next'), {
    recursive: true,
    force: true,
  });
  await run('tar', ['-xzf', buildArchive, '-C', applicationRoot]);
  await access(path.join(applicationRoot, '.next', 'BUILD_ID'));
} else {
  console.log('No prebuilt application found; building on the server...');
  await run(process.execPath, [
    path.join(applicationRoot, 'node_modules/next/dist/bin/next'),
    'build',
    '--webpack',
  ]);
}

console.log('cPanel deployment completed successfully.');
