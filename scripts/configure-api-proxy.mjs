#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
const path = new URL('../vercel.json', import.meta.url);
try {
  const destination = new URL(process.argv[2] ?? '');
  const pathname = destination.pathname.replace(/\/$/, '');
  if (destination.protocol !== 'https:' || destination.username || destination.password || destination.search || destination.hash ||
      (pathname !== '' && !pathname.endsWith('/api'))) {
    throw new Error('Pass your deployed backend HTTPS origin or API base ending in /api, without credentials, a query or a fragment.');
  }
  const apiBase = destination.origin + (pathname || '/api');
  const config = JSON.parse(await readFile(path, 'utf8'));
  config.rewrites = [
    { source: '/api/:path*', destination: apiBase + '/:path*' },
    ...(config.rewrites ?? []).filter((rule) => rule.source !== '/api/:path*'),
  ];
  await writeFile(path, JSON.stringify(config, null, 2) + '\n');
  console.log('vercel.json forwards /api to ' + apiBase + '. No deployment was performed.');
} catch (error) {
  console.error(error.message);
  console.error('Usage: npm run deploy:api -- https://your-backend.example/prefix/api');
  process.exitCode = 1;
}
