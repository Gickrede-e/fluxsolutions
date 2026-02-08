import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

const rootEnvPath = resolve(process.cwd(), '../../.env');
const localEnvPath = resolve(process.cwd(), '.env');

if (existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath, override: false });
}

if (existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: false });
}

const args = process.argv.slice(2);

if (!args.length) {
  console.error('Usage: node prisma-runner.mjs <prisma args...>');
  process.exit(1);
}

const child = spawn('prisma', args, {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
