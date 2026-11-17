import { traceEvent } from './lib/trace.ts';
import { readStats, readForecast, readObject } from './lib/json.ts';
import { requireValue } from '../web/lib/validation.ts';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSharedStore } from '../web/lib/shared-store.ts';
assert(process.env.OPENAI_API_KEY, '缺少已授权的服务端凭据');
assert(process.env.VERIFICATION_WORK, '必须指定 VERIFICATION_WORK');
const directory = await mkdtemp(path.join(process.env.VERIFICATION_WORK, 'model-limit-')),
  children: import('node:child_process').ChildProcessByStdio<
    null,
    import('node:stream').Readable,
    import('node:stream').Readable
  >[] = [],
  events: { event: string }[] = [];
const report: {
  at: string;
  说明: '两个生产实例、隔离共享目录；预置 23 个配额时间戳，再并发实际请求 2 次，避免为验证配额调用 24 次付费模型。天气为受控夹具。';
  prefilled: 23;
  requests: 2;
  before?: { calls: { forecast: number } };
  rows?: {
    port: number;
    status: number;
    source: unknown;
    code: unknown;
    model: unknown;
    modelMs: unknown;
  }[];
  events?: { event: string }[];
  modelCalls?: 1;
  after?: { calls: { forecast: number } };
  weatherCalls?: number;
} = {
  at: new Date().toISOString(),
  说明: '两个生产实例、隔离共享目录；预置 23 个配额时间戳，再并发实际请求 2 次，避免为验证配额调用 24 次付费模型。天气为受控夹具。',
  prefilled: 23,
  requests: 2,
};
const stats = () => fetch('http://127.0.0.1:3399/stats').then((r) => readStats(r));
try {
  report.before = await stats();
  for (const port of [3307, 3308] as const) {
    const env = {
      ...process.env,
      AI_API_KEY: process.env.OPENAI_API_KEY,
      AI_MODEL: 'gpt-4.1-mini',
      AI_BASE_URL: 'https://api.openai.com/v1',
      WEATHER_MODE: 'live',
      WEATHER_FORECAST_URL: 'http://127.0.0.1:3399/forecast',
      WEATHER_CACHE_DIR: directory,
      WEATHER_TRACE: '1',
      NODE_USE_ENV_PROXY: '1',
      NO_PROXY: '127.0.0.1,localhost',
    };
    const child = spawn(
      process.execPath,
      [
        'node_modules/next/dist/bin/next',
        'start',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(port),
      ],
      {
        cwd: fileURLToPath(new URL('../web', import.meta.url)),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    children.push(child);
    let buffer = '';
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines)
        try {
          const e = traceEvent(line);
          if (e) events.push(e);
        } catch {}
    });
    child.stderr.on('data', () => {});
  }
  for (const port of [3307, 3308] as const)
    for (let i = 0; ; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/weather?lat=37.566&lon=126.9784`);
        assert(r.ok);
        break;
      } catch (e) {
        if (i >= 60) throw e;
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  const forecast = await fetch('http://127.0.0.1:3307/api/weather?lat=37.566&lon=126.9784').then(
    (r) => readForecast(r),
  );
  await createSharedStore(directory).write('ask-budget', Array(23).fill(Date.now()));
  report.rows = await Promise.all(
    [3307, 3308].map(async (port) => {
      const r = await fetch(`http://127.0.0.1:${port}/api/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lat: 37.566,
          lon: 126.9784,
          version: forecast.version,
          locale: 'zh-Hans',
          question: '首尔和台北明天早上7–9点，哪里更容易下雨？',
        }),
      });
      const b = await readObject(r);
      return {
        port,
        status: r.status,
        source: b.source,
        code: b.code,
        model: b.model,
        modelMs: b.modelMs,
      };
    }),
  );
  assert.deepEqual(report.rows.map((r) => r.status).sort(), [200, 429]);
  assert.equal(
    requireValue(report.rows.find((r: { status: number }) => r.status === 200)).source,
    'model',
  );
  assert.equal(events.filter((e) => e.event === 'model-call').length, 1);
  report.events = events;
  report.modelCalls = 1;
  report.after = await stats();
  report.weatherCalls =
    requireValue(report.after).calls.forecast - requireValue(report.before).calls.forecast;
} finally {
  for (const child of children) child.kill('SIGTERM');
  await Promise.all(
    children.map(
      (c) =>
        new Promise<void>((resolve) => (c.exitCode !== null ? resolve() : c.once('exit', resolve))),
    ),
  );
  await rm(directory, { recursive: true, force: true });
  await writeFile(
    new URL('./evidence/model-shared-limit.json', import.meta.url),
    JSON.stringify(report, null, 2),
  );
}
console.log(JSON.stringify(report));
