import { readStats } from './lib/json.ts';
import { chromium } from 'playwright-core';
import { requireValue } from '../web/lib/validation.ts';
import { errorInfo } from '../web/lib/errors.ts';
// 同一机器、上游延迟与浏览器；独立进程和缓存，五轮前后交替。
import { ChildProcess, spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { catalog, localPlace, placeURL } from '../web/lib/catalog.ts';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const base = 'http://127.0.0.1:3331',
  upstream = 'http://127.0.0.1:3330';
const wait = (ms: number | undefined) => new Promise((r) => setTimeout(r, ms));
const output = path.join(root, 'qa/evidence');
await mkdir(output, { recursive: true });
async function start(
  args: readonly string[],
  cwd: string,
  env: Record<string, string | undefined>,
  log: string,
) {
  const fd = await open(path.join(output, log), 'a');
  const proc = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', fd.fd, fd.fd],
  });
  await fd.close();
  return proc;
}
async function ready(url: string | URL | Request, proc: ChildProcess) {
  for (let i = 0; i < 100; i++) {
    if (proc.exitCode !== null) throw Error('测试进程提前退出');
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await wait(100);
  }
  throw Error('测试实例未就绪');
}
async function stop(proc: ChildProcess) {
  if (proc.exitCode !== null) return;
  const done = new Promise((resolve) => proc.once('exit', resolve));
  proc.kill('SIGTERM');
  await done;
}
const fixture = await start(
  ['qa/upstream-fixture.ts'],
  root,
  { FIXTURE_PORT: '3330' },
  'next-performance-fixture.log',
);
let browser: import('playwright-core').Browser | undefined;
const runs: {
  round: number;
  variant: string;
  clickToWeatherMs: number;
  initialJSBytes: unknown;
  lcpMs: number;
  backgroundRSCRequests: number;
  backgroundRSCBytes: unknown;
  clickRSCRequests: number;
  upstreamBeforeClick: unknown;
  upstreamAfterClick: unknown;
}[] = [];
try {
  await ready(upstream + '/stats', fixture);
  browser = await chromium.launch({ headless: true });
  for (let round = 1; round <= 5; round++)
    for (const variant of ['before', 'after'] as const) {
      await fetch(upstream + '/control?delay=600&reset=1');
      const cache = await mkdtemp(path.join(tmpdir(), 'wa-perf-'));
      const server = await start(
        ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3331'],
        path.join(root, 'web'),
        {
          NEXT_DIST_DIR: `.next-perf-${variant}`,
          SITE_URL: base,
          WEATHER_MODE: 'live',
          WEATHER_FORECAST_URL: upstream + '/forecast',
          WEATHER_CACHE_DIR: cache,
          AI_API_KEY: '',
          OPENAI_API_KEY: '',
          OPENROUTER_API_KEY: '',
        },
        `next-performance-${variant}-server.log`,
      );
      let context: import('playwright-core').BrowserContext | undefined;
      try {
        await ready(base + '/robots.txt', server);
        context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        await context.addInitScript(
          (saved) => {
            window.__waLCP = 0;
            new PerformanceObserver((list) => {
              window.__waLCP = list.getEntries().at(-1)?.startTime || window.__waLCP;
            }).observe({ type: 'largest-contentful-paint', buffered: true });
            try {
              localStorage.setItem('wa.saved', JSON.stringify(saved));
            } catch {}
          },
          catalog.map((p) => localPlace(p, 'en')),
        );
        const page = await context.newPage(),
          cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        const requests = new Map<
          string,
          { type: string; url: string; bytes: number; phase: string }
        >();
        cdp.on('Network.responseReceived', ({ requestId, type, response }) =>
          requests.set(requestId, { type, url: response.url, bytes: 0, phase: phase }),
        );
        cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
          const r = requests.get(requestId);
          if (r) r.bytes = encodedDataLength;
        });
        let phase = 'initial';
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(errorInfo(e).message));
        page.setDefaultTimeout(15000);
        await page.goto(base + placeURL('en', localPlace(catalog[0], 'en')));
        await page.locator('.city-row').first().waitFor();
        await page.waitForFunction(
          (key: string) => !!localStorage.getItem(key),
          `wa.weather.${catalog[0].lat},${catalog[0].lon}`,
        );
        await page.waitForTimeout(400);
        const initialJS = [...requests.values()]
          .filter((r) => r.type === 'Script')
          .reduce((n, r) => n + r.bytes, 0);
        phase = 'idle';
        await page.waitForTimeout(2200);
        const beforeClick = await readStats(await fetch(upstream + '/stats'));
        const lcpMs = Math.round(await page.evaluate(() => window.__waLCP));
        const rsc = [...requests.values()].filter((r) => r.url.includes('_rsc='));
        phase = 'click';
        const startTime = performance.now();
        await page
          .locator(
            `.city-row a[href="${placeURL(
              'en',
              localPlace(requireValue(catalog.find((c) => c.slug.startsWith('taipei-'))), 'en'),
            )}"]`,
          )
          .click();
        await page.waitForFunction(
          () =>
            document.querySelector('h1')?.textContent === 'Taipei' &&
            document.querySelector('.weather-date')?.textContent.includes('Asia/Taipei') &&
            document.querySelector('.temperature > span')?.textContent === '8' &&
            document.querySelectorAll('.hour').length === 24,
        );
        const clickToWeather = performance.now() - startTime;
        await page.waitForTimeout(200);
        const afterClick = await readStats(await fetch(upstream + '/stats'));
        assert.deepEqual(errors, []);
        runs.push({
          round,
          variant,
          clickToWeatherMs: Math.round(clickToWeather),
          initialJSBytes: initialJS,
          lcpMs,
          backgroundRSCRequests: rsc.length,
          backgroundRSCBytes: rsc.reduce((n, r) => n + r.bytes, 0),
          clickRSCRequests: [...requests.values()].filter(
            (r) => r.phase === 'click' && r.url.includes('_rsc='),
          ).length,
          upstreamBeforeClick: beforeClick.calls,
          upstreamAfterClick: afterClick.calls,
        });
        console.log(JSON.stringify(runs.at(-1)));
        if (round === 1)
          await page.screenshot({
            path: path.join(output, `next-performance-${variant}.png`),
            fullPage: true,
          });
      } finally {
        await context?.close();
        await stop(server);
      }
    }
  const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const summary = Object.fromEntries(
    ['before', 'after'].map((variant) => {
      const rows = runs.filter((r) => r.variant === variant);
      return [
        variant,
        Object.fromEntries(
          (
            [
              'clickToWeatherMs',
              'initialJSBytes',
              'lcpMs',
              'backgroundRSCRequests',
              'backgroundRSCBytes',
              'clickRSCRequests',
            ] as const
          ).map((k) => [k, median(rows.map((r) => Number(r[k])))]),
        ),
      ];
    }),
  );
  await writeFile(
    path.join(output, 'next-performance.json'),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        conditions: {
          rounds: 5,
          order: 'before,after',
          upstreamDelayMs: 600,
          viewport: '1440x1000',
          dwellMs: 2600,
          browser: browser.version(),
          fixture: true,
          realModelCalls: 0,
        },
        summary,
        runs,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(summary));
} finally {
  await browser?.close();
  await stop(fixture);
}
