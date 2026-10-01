#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
const path = new URL('../vercel.json', import.meta.url);
try {
  const destination = new URL(process.argv[2] ?? '');
  if (destination.protocol !== 'https:' || destination.username || destination.password || destination.search || destination.hash || destination.pathname !== '/') {
    throw new Error('Pass your deployed backend HTTPS origin, without a path, credentials or query.');
  }
  const config = JSON.parse(await readFile(path, 'utf8'));
  config.rewrites = [
    { source: '/api/:path*', destination: destination.origin + '/api/:path*' },
    ...(config.rewrites ?? []).filter((rule) => rule.source !== '/api/:path*'),
  ];
  await writeFile(path, JSON.stringify(config, null, 2) + '\n');
  console.log('vercel.json forwards /api to ' + destination.origin + '. No deployment was performed.');
} catch (error) {
  console.error(error.message);
  console.error('Usage: npm run deploy:api -- https://your-backend.example');
  process.exitCode = 1;
}
