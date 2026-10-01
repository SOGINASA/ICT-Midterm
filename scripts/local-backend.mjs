#!/usr/bin/env node
import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, access, open, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const backend = root + 'backend';
const runtime = backend + '/.runtime';
const python = backend + '/.venv/bin/python';
const appPath = backend + '/app.py';
const pidPath = runtime + '/server.pid';
const action = process.argv[2] ?? 'start';
const api = 'http://127.0.0.1:8000/api';
async function exists(path) { try { await access(path); return true; } catch { return false; } }
function run(command, args, cwd = backend) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(command + ' exited with status ' + code)));
  });
}
async function ownedPid() {
  let pid;
  try { pid = Number((await readFile(pidPath, 'utf8')).trim()); } catch { return null; }
  if (!Number.isSafeInteger(pid) || pid < 2) return null;
  try {
    const command = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return command.includes(appPath) ? pid : null;
  } catch { return null; }
}
async function health() {
  try {
    const response = await fetch(api + '/health', { signal: AbortSignal.timeout(1500) });
    const body = await response.json();
    return response.ok && body.status === 'ok';
  } catch { return false; }
}
async function prepare() {
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  if (!(await exists(python))) {
    let interpreter = process.env.TENGEFLOW_PYTHON;
    if (!interpreter) {
      for (const candidate of ['python3.11', 'python3.13', 'python3']) {
        try {
          execFileSync(candidate, ['-c', 'import sys; assert sys.version_info >= (3, 11)'], { stdio: 'ignore' });
          interpreter = candidate;
          break;
        } catch { /* Try another installed interpreter. */ }
      }
    }
    if (!interpreter) throw new Error('Install Python 3.11+ or set TENGEFLOW_PYTHON.');
    await run(interpreter, ['-m', 'venv', backend + '/.venv']);
  }
  const digest = createHash('sha256').update(await readFile(backend + '/requirements.txt')).digest('hex');
  const stamp = runtime + '/requirements.sha256';
  if (await readFile(stamp, 'utf8').catch(() => '') !== digest) {
    await run(python, ['-m', 'pip', 'install', '-r', 'requirements.txt']);
    await writeFile(stamp, digest, { mode: 0o600 });
  }
  if (!(await exists(backend + '/.env'))) {
    await writeFile(backend + '/.env', 'APP_ENV=development\nJWT_SECRET_KEY=' + randomBytes(48).toString('hex') + '\nFRONTEND_URL=http://localhost:3000\nCORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000\n', { mode: 0o600, flag: 'wx' });
  }
  await run(python, ['-m', 'flask', '--app', 'app', 'db', 'upgrade']);
}
async function configureFrontend() {
  const path = root + '.env.local';
  const previous = await readFile(path, 'utf8').catch(() => '');
  const retained = previous.split(/\r?\n/).filter((line) =>
    !/^REACT_APP_(?:SUPABASE_\w+|API_URL)=/.test(line) &&
    !/^# Local (?:Supabase|TengeFlow API)/.test(line)).join('\n').trim();
  await writeFile(path, (retained ? retained + '\n\n' : '') + '# Local TengeFlow API through the CRA proxy. Public configuration only.\nPENIS_APP_API_URL=/api\n', { mode: 0o600 });
}
function addresses() {
  console.log('API: ' + api + '\nLocal inbox: ' + api + '/dev/inbox\nDatabase: backend/instance/tengeflow.sqlite3');
}
try {
  if (action === 'start') {
    const running = await ownedPid();
    if (running) {
      if (!(await health())) throw new Error('Saved backend process is unhealthy. Inspect backend/.runtime/server.log.');
      await configureFrontend();
      console.log('TengeFlow backend is already running (PID ' + running + ').');
      addresses();
    } else {
      if (await health()) throw new Error('Port 8000 is serving another API. Stop it explicitly first.');
      await prepare();
      const log = await open(runtime + '/server.log', 'a', 0o600);
      const child = spawn(python, [appPath], {
        cwd: backend, detached: true, stdio: ['ignore', log.fd, log.fd],
        env: { ...process.env, PYTHONUNBUFFERED: '1', HOST: '127.0.0.1', PORT: '8000' },
      });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      await writeFile(pidPath, String(child.pid), { mode: 0o600 });
      child.unref();
      await log.close();
      let ready = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (!(await ownedPid())) break;
        if (await health()) { ready = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!ready) throw new Error('Backend did not become healthy. Inspect backend/.runtime/server.log.');
      await configureFrontend();
      console.log('TengeFlow backend is running (PID ' + child.pid + '); migrations applied.');
      addresses();
    }
  } else if (action === 'stop') {
    const pid = await ownedPid();
    if (pid) {
      process.kill(pid, 'SIGTERM');
      for (let attempt = 0; attempt < 40 && await ownedPid(); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 100));
      if (await ownedPid()) throw new Error('Backend is still stopping. Check its process.');
    }
    await unlink(pidPath).catch(() => {});
    console.log('TengeFlow backend stopped. Database and local emails are preserved.');
  } else if (action === 'status') {
    const pid = await ownedPid();
    console.log(pid ? 'TengeFlow backend: ' + (await health() ? 'healthy' : 'unhealthy') + ' (PID ' + pid + ').' : 'TengeFlow backend: stopped.');
    addresses();
  } else if (action === 'test') {
    await prepare();
    await run(python, ['-m', 'pytest', '-q']);
  } else throw new Error('Usage: node scripts/local-backend.mjs start|stop|status|test');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
