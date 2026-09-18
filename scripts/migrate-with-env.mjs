#!/usr/bin/env node
import 'dotenv/config.js';
import { childProcess } from 'child_process';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrate = spawn('node', [path.join(__dirname, 'mysql-migrate.mjs')], {
  stdio: 'inherit',
  env: process.env,
});

migrate.on('exit', (code) => {
  process.exit(code);
});
