import { readStats } from './lib/json.ts';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url).pathname,
  base =
    process.env.WEATHER_BASELINE_WEB ||
    new URL('../../baseline/weather-atlas/web/', import.meta.url).pathname,
  cache = await mkdtemp(path.join(tmpdir(), 'atlas-ttfb-'));
const node = process.execPath,
  cli = path.join(root, 'web/node_modules/next/dist/bin/next'),
  hook = new URL('./upstream-hook.ts', import.meta.url).pathname,
  logs: { kind: string; text: unknown }[] = [],
  rows: {
    kind: string;
    phase: string;
    ttfb: number;
    total: number;
    bytes: number;
    upstream: number;
  }[] = [];
async function start(kind: string) {
  const child = spawn(
    node,
    ['--import', hook, cli, 'start', '--hostname', '127.0.0.1', '--port', '3304'],
    {
      cwd: kind === 'baseline' ? base : path.join(root, 'web'),
      env: {
        ...process.env,
        WEATHER_MODE: 'live',
        WEATHER_FORECAST_URL: 'http://127.0.0.1:3399/forecast',
        TEST_FORECAST_OVERRIDE: 'http://127.0.0.1:3399/forecast',
        WEATHER_CACHE_DIR: cache,
        WEATHER_TRACE: '1',
        SITE_URL: 'http://127.0.0.1:3304',
      },
    },
  );
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('start timeout')), 15000);
    child.stdout.on('data', (b: Buffer) => {
      const s = b.toString();
      logs.push({ kind, text: s });
      if (s.includes('Ready')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on('data', (b: Buffer) => logs.push({ kind, text: b.toString() }));
    child.once('exit', (c) => {
      clearTimeout(timer);
      reject(Error('exit ' + c));
    });
  });
  return async () => {
    child.kill('SIGTERM');
    await new Promise((r) => child.once('exit', r));
  };
}
async function visit(kind: string, phase: string) {
  const before = await fetch('http://127.0.0.1:3399/stats').then((r) => readStats(r)),
    t = performance.now();
  const r = await fetch('http://127.0.0.1:3304/en/weather/seoul-1835848', {
      headers: { 'user-agent': 'Googlebot' },
    }),
    ttfb = performance.now() - t,
    html = await r.text(),
    total = performance.now() - t;
  assert.equal(r.status, 200);
  assert(html.includes('class="hour'));
  const after = await fetch('http://127.0.0.1:3399/stats').then((r) => readStats(r));
  rows.push({
    kind,
    phase,
    ttfb,
    total,
    bytes: Buffer.byteLength(html),
    upstream: after.calls.forecast - before.calls.forecast,
  });
}
try {
  await fetch('http://127.0.0.1:3399/control?delay=4000&reset=1');
  for (const kind of ['baseline', 'shared'] as const) {
    let stop = await start(kind);
    try {
      await visit(kind, 'cold');
      for (let i = 0; i < 5; i++) await visit(kind, 'warm');
    } finally {
      await stop();
    }
    stop = await start(kind);
    try {
      await visit(kind, 'restart');
    } finally {
      await stop();
    }
  }
  const report: {
    at: string;
    upstream: 'controlled 4000ms, not a real provider TTFB';
    rows: {
      kind: string;
      phase: string;
      ttfb: number;
      total: number;
      bytes: number;
      upstream: number;
    }[];
    logs: { kind: string; text: unknown }[];
  } = {
    at: new Date().toISOString(),
    upstream: 'controlled 4000ms, not a real provider TTFB',
    rows,
    logs,
  };
  await writeFile(
    new URL('./evidence/ttfb.json', import.meta.url),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(rows));
} finally {
  await fetch('http://127.0.0.1:3399/control');
  await rm(cache, { recursive: true, force: true });
}
