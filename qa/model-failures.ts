import { readForecast, readObject } from './lib/json.ts';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
let mode = 'timeout',
  calls = 0;
const timers: NodeJS.Timeout[] = [];
const server = http.createServer((req, res) => {
  req.resume();
  calls++;
  if (mode === 'limited') {
    res.writeHead(429);
    res.end('{}');
  } else
    timers.push(
      setTimeout(() => {
        res.writeHead(503);
        res.end('{}');
      }, 13000),
    );
});
await new Promise<void>((r) => server.listen(3397, '127.0.0.1', r));
const root = new URL('../web/', import.meta.url).pathname,
  cache = await mkdtemp(path.join(tmpdir(), 'atlas-model-failures-'));
const child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3306'],
    {
      cwd: root,
      env: {
        ...process.env,
        AI_API_KEY: 'local-fixture',
        AI_MODEL: 'http-failure-fixture',
        AI_BASE_URL: 'http://127.0.0.1:3397',
        WEATHER_MODE: 'live',
        WEATHER_FORECAST_URL: 'http://127.0.0.1:3399/forecast',
        WEATHER_CACHE_DIR: cache,
      },
    },
  ),
  rows: { scenario: string; status: number; code: unknown; ms: number }[] = [];
try {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(Error('startup')), 15000);
    child.stdout.on('data', (b: Buffer) => {
      if (b.toString().includes('Ready')) {
        clearTimeout(t);
        resolve();
      }
    });
    child.once('exit', (c) => reject(Error('exit ' + c)));
  });
  const forecast = await fetch('http://127.0.0.1:3306/api/weather?lat=37.566&lon=126.9784').then(
    (r) => readForecast(r),
  );
  for (const scenario of ['timeout', 'limited'] as const) {
    mode = scenario;
    const start = performance.now();
    const r = await fetch('http://127.0.0.1:3306/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: '首尔和台北明天早上7–9点哪里更容易下雨？',
          locale: 'zh-Hans',
          lat: 37.566,
          lon: 126.9784,
          version: forecast.version,
        }),
      }),
      b = await readObject(r);
    rows.push({
      scenario,
      status: r.status,
      code: b.code,
      ms: Math.round(performance.now() - start),
    });
    assert.equal(r.status, scenario === 'timeout' ? 504 : 429);
  }
  assert.equal(calls, 2);
} finally {
  child.kill('SIGTERM');
  await new Promise((r) => child.once('exit', r));
  timers.forEach(clearTimeout);
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await rm(cache, { recursive: true, force: true });
  await writeFile(
    new URL('./evidence/model-failures.json', import.meta.url),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        kind: 'controlled real HTTP, not provider failure',
        modelFixtureCalls: calls,
        externalModelCalls: 0,
        rows,
      },
      null,
      2,
    ),
  );
}
console.log(JSON.stringify(rows));
