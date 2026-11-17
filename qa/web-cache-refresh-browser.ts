import assert from 'node:assert/strict';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type BrowserContext } from 'playwright-core';
import { createSharedStore } from '../web/lib/shared-store.ts';
import { validSnapshot } from '../web/lib/client-forecast.ts';
import { decode, isFiniteNumber, isRecord, parseJson, readJson } from '../web/lib/validation.ts';
import { labels } from '../web/lib/ui-text.ts';
import type { WeatherFailure } from '../web/lib/weather-request.ts';
import { catalog, locales } from '../web/lib/catalog.ts';

// 独立生产实例和临时缓存；不改日常服务、不调用真实天气／模型。
const root = fileURLToPath(new URL('..', import.meta.url));
const directory = await mkdtemp(path.join(tmpdir(), 'atlas-web-refresh-'));
const appPort = Number(process.env.QA_REFRESH_PORT || 3338);
const fixturePort = Number(process.env.QA_REFRESH_FIXTURE_PORT || 3398);
const base = `http://127.0.0.1:${appPort}`;
const upstream = `http://127.0.0.1:${fixturePort}`;
const forecastURL = upstream + '/forecast';
const city = catalog.find((city) => city.id === 1835848);
assert(city);
const coordinates = `${city.lat},${city.lon}`;
const key = `forecast-v3:${createHash('sha256').update(forecastURL).digest('hex').slice(0, 12)}:${coordinates}`;
const storageKey = `wa.weather.v2:live-v1-${createHash('sha256').update(forecastURL).digest('hex').slice(0, 12)}:${coordinates}`;
const store = createSharedStore(directory);
const rows: Record<string, unknown>[] = [];
const errors: string[] = [];
const children: ChildProcess[] = [];
const evidence = path.join(root, 'qa/evidence');
const run = process.env.QA_REFRESH_RUN || 'web-cache-refresh';
await mkdir(evidence, { recursive: true });
const log = await open(path.join(evidence, `${run}-fixture.log`), 'w');
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
async function json(url: string) {
  const response = await fetch(url);
  assert(response.ok, `${url}: ${response.status}`);
  return readJson(response);
}
async function control(failure = 0, wait = 0) {
  await json(`${upstream}/control?reset=1&failure=${failure}&delay=${wait}`);
}
async function forecasts() {
  const stats = await json(upstream + '/stats');
  assert(isRecord(stats) && isRecord(stats.calls) && isFiniteNumber(stats.calls.forecast));
  assert.equal(stats.calls.model, 0);
  return stats.calls.forecast;
}
async function start(args: string[], cwd: string, env: NodeJS.ProcessEnv, ready: string) {
  // 端口已被占用时直接失败，避免误把其他服务当作本轮实例。
  const { createServer } = await import('node:net');
  const check = createServer();
  await new Promise<void>((resolve, reject) =>
    check.once('error', reject).listen(Number(new URL(ready).port), '127.0.0.1', resolve),
  );
  await new Promise<void>((resolve, reject) => check.close((e) => (e ? reject(e) : resolve())));
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    stdio: ['ignore', log.fd, log.fd],
  });
  children.push(child);
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(child.exitCode, null, '受控服务提前退出');
    try {
      if ((await fetch(ready)).ok) return;
    } catch {}
    await delay(100);
  }
  throw Error('受控服务启动超时');
}
async function context(width: number) {
  assert(browser);
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', { value: { saveData: true } });
  });
  return ctx;
}
async function openCity(ctx: BrowserContext, locale: string) {
  const page = await ctx.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const requests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/weather') requests.push(url.href);
    assert.notEqual(url.pathname, '/api/ask');
  });
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/weather');
  void response.catch(() => {});
  const html = await page.goto(`${base}/${locale}/weather/seoul-1835848`);
  assert(html && html.status() === 200);
  return { page, response, requests, html };
}
try {
  await start(
    ['qa/upstream-fixture.ts'],
    root,
    { ...process.env, FIXTURE_PORT: String(fixturePort) },
    upstream + '/stats',
  );
  await start(
    [
      'node_modules/next/dist/bin/next',
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(appPort),
    ],
    path.join(root, 'web'),
    {
      ...process.env,
      NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || '.next-web-cache-refresh',
      WEATHER_MODE: 'live',
      WEATHER_FORECAST_URL: forecastURL,
      WEATHER_CACHE_DIR: directory,
      SITE_URL: base,
    },
    base + '/robots.txt',
  );
  const warm = decode(
    await json(`${base}/api/weather?lat=${city.lat}&lon=${city.lon}&fresh=1`),
    validSnapshot,
  );
  async function age() {
    const at = Date.now() - 16 * 60_000;
    await store.write(key, {
      at,
      value: { ...warm, version: 'aged', fetchedAt: new Date(at).toISOString() },
    });
    await store.write('failure:' + key, { at: 0 });
  }
  browser = await chromium.launch({ headless: true });
  for (const width of [1440, 1024, 768, 390]) {
    for (const locale of locales) {
      await age();
      await control(0, 1700);
      const ctx = await context(width);
      try {
        const { page, response, requests, html } = await openCity(ctx, locale);
        const state = page.getByTestId('forecast-refresh');
        await state.filter({ hasText: labels(locale).refreshingForecast }).waitFor();
        assert(await state.isDisabled());
        assert(!(await html.text()).includes(labels(locale).refreshFailed));
        assert((await html.text()).includes('aged'));
        assert.equal(await page.locator('.hour').count(), 24);
        const busy = page
          .locator('[aria-busy="true"]')
          .filter({ has: page.locator('.current-panel') });
        assert.equal(await busy.count(), 1);
        assert.equal(
          await page
            .locator('.trend path[stroke="var(--trend-line)"]')
            .evaluate((el) => getComputedStyle(el).stroke),
          'rgb(59, 118, 91)',
        );
        assert.equal(
          await page
            .locator('.current-panel .weather-icon path[stroke="var(--weather-cloud-stroke)"]')
            .evaluate((el) => getComputedStyle(el).stroke),
          'rgb(83, 101, 91)',
        );
        if (width === 390 && locale === 'zh-Hans')
          await page.screenshot({ path: path.join(evidence, `${run}-updating.png`) });
        const data = decode(parseJson(await (await response).text()), validSnapshot);
        assert(!data.stale && data.version !== 'aged');
        await state.waitFor({ state: 'detached' });
        assert.equal(requests.length, 1);
        assert.equal(new URL(requests[0]).searchParams.get('fresh'), '1');
        assert.equal(await forecasts(), 1, 'SSR 与浏览器复用同一次上游刷新');
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        rows.push({
          scenario: '后台刷新不误报',
          locale,
          width,
          weatherRequests: requests.length,
          upstreamForecasts: 1,
        });
      } finally {
        await ctx.close();
      }
    }
  }
  for (const locale of locales) {
    await age();
    await control(503, 1000);
    const ctx = await context(390);
    try {
      const { page, response, requests } = await openCity(ctx, locale);
      const data = decode(parseJson(await (await response).text()), validSnapshot);
      assert(data.stale);
      const failed = page
        .getByTestId('forecast-refresh')
        .filter({ hasText: labels(locale).refreshFailed });
      await failed.waitFor();
      assert.equal(await page.locator('.hour').count(), 24);
      assert((await page.locator('.provider').innerText()).includes(labels(locale).fetched));
      assert.equal(await forecasts(), 1);
      await control();
      // 受控测试解除 30 秒故障冷却；不修改日常缓存。
      await store.write('failure:' + key, { at: 0 });
      await failed.click();
      await page.getByTestId('forecast-refresh').waitFor({ state: 'detached' });
      assert.equal(await forecasts(), 1);
      assert.equal(requests.length, 2);
      rows.push({
        scenario: '真实上游失败保留快照并可重试恢复',
        locale,
        width: 390,
        weatherRequests: 2,
        upstreamForecasts: 2,
      });
      if (locale === 'zh-Hans')
        await page.screenshot({ path: path.join(evidence, `${run}-recovered.png`) });
    } finally {
      await ctx.close();
    }
  }
  await store.write(key, { at: 0, value: null });
  await control(503);
  const ctx = await context(390);
  try {
    await ctx.addInitScript(
      ({ key, snapshot }) => localStorage.setItem(key, JSON.stringify(snapshot)),
      { key: storageKey, snapshot: warm },
    );
    await ctx.route('**/api/weather?*', (route) => route.abort('internetdisconnected'));
    const page = await ctx.newPage();
    await page.goto(base + '/zh-Hans/weather/seoul-1835848');
    const failure = page
      .getByTestId('forecast-refresh')
      .filter({ hasText: labels('zh-Hans').refreshFailed });
    await failure.waitFor();
    assert.equal(await page.locator('.hour').count(), 24);
    await ctx.unroute('**/api/weather?*');
    await control();
    await store.write('failure:' + key, { at: 0 });
    await failure.click();
    await page.getByTestId('forecast-refresh').waitFor({ state: 'detached' });
    rows.push({
      scenario: 'SSR 不可用、本地快照恢复、浏览器断网与手动恢复',
      width: 390,
      locale: 'zh-Hans',
    });
  } finally {
    await ctx.close();
  }
  const failures: { status: number; code: string; reason: WeatherFailure }[] = [
    { status: 429, code: 'RATE_LIMITED', reason: 'limited' },
    { status: 504, code: 'UPSTREAM_TIMEOUT', reason: 'timeout' },
    { status: 503, code: 'BUSY', reason: 'unavailable' },
    { status: 502, code: 'INVALID_UPSTREAM', reason: 'invalid' },
    { status: 400, code: 'INVALID_INPUT', reason: 'input' },
    { status: 0, code: '', reason: 'network' },
  ];
  for (const locale of locales)
    for (const sample of failures) {
      await age();
      await control(503);
      const ctx = await context(390);
      let calls = 0;
      try {
        await ctx.route('**/api/weather?*', async (route) => {
          calls++;
          if (!sample.status) await route.abort('internetdisconnected');
          else
            await route.fulfill({
              status: sample.status,
              contentType: 'application/json',
              headers: { 'Retry-After': '2' },
              body: JSON.stringify({ code: sample.code, error: 'private upstream detail' }),
            });
        });
        const page = await ctx.newPage();
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(`${base}/${locale}/weather/seoul-1835848`);
        await page
          .locator('.weather-feedback')
          .filter({ hasText: labels(locale)[`weather_${sample.reason}`] })
          .waitFor();
        assert.equal(await page.locator('.hour').count(), 24);
        assert(!(await page.locator('body').innerText()).includes('private upstream detail'));
        const retry = page.getByTestId('forecast-refresh');
        if (sample.reason === 'limited') {
          assert(await retry.isDisabled());
          await delay(100);
          assert.equal(calls, 1);
          await page.waitForFunction(() => {
            const node = document.querySelector('[data-testid="forecast-refresh"]');
            return node instanceof HTMLButtonElement && !node.disabled;
          });
        }
        await ctx.unroute('**/api/weather?*');
        await ctx.route('**/api/weather?*', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(warm),
          }),
        );
        await retry.click();
        await retry.waitFor({ state: 'detached' });
        assert.equal(await page.locator('.weather-feedback').innerText(), '');
        rows.push({
          scenario: '四语错误分类与恢复',
          locale,
          reason: sample.reason,
          retainedHours: 24,
        });
      } finally {
        await ctx.close();
      }
    }
  await store.write(key, { at: 0, value: null });
  await control(503);
  const isolated = await context(390);
  try {
    const foreign = {
      ...warm,
      version: 'foreign-provider',
      fetchedAt: new Date().toISOString(),
      current: { ...warm.current, temp: 999 },
    };
    await isolated.addInitScript(
      ({ coords, snapshot }) => {
        localStorage.setItem(`wa.weather.${coords}`, JSON.stringify(snapshot));
        localStorage.setItem(`wa.weather.v2:foreign-provider:${coords}`, JSON.stringify(snapshot));
      },
      { coords: coordinates, snapshot: foreign },
    );
    await isolated.route('**/api/weather?*', (route) => route.abort('internetdisconnected'));
    const page = await isolated.newPage();
    await page.goto(`${base}/en/weather/seoul-1835848`);
    await page
      .locator('.weather-feedback')
      .filter({ hasText: labels('en').weather_network })
      .waitFor();
    assert.equal(await page.locator('.hour').count(), 0, 'SSR 无数据时拒绝旧供方及旧版缓存');
    rows.push({ scenario: 'SSR 无数据时隔离供方及旧版缓存', retainedHours: 0 });
  } finally {
    await isolated.close();
  }
  await control();
  await store.write('failure:' + key, { at: 0 });
  await json(`${base}/api/weather?lat=${city.lat}&lon=${city.lon}&fresh=1`);
  const languages = await context(390);
  try {
    const page = await languages.newPage();
    let calls = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/weather') calls++;
    });
    await page.goto(`${base}/en/weather/seoul-1835848`);
    await page.locator('.hour').first().waitFor();
    for (const locale of locales) {
      await page.locator('#locale-select').selectOption(locale);
      await page.waitForURL((url) => url.pathname.startsWith(`/${locale}/`));
      await page.locator('.hour').first().waitFor();
    }
    assert.equal(calls, 0);
    rows.push({ scenario: '切四语复用有效天气', weatherRequests: calls });
    await page.screenshot({ path: path.join(evidence, `${run}-languages.png`) });
  } finally {
    await languages.close();
  }
  const timed = await context(390);
  try {
    await age();
    await control(503);
    await timed.route('**/api/weather?*', () => {});
    const page = await timed.newPage();
    await page.clock.install();
    const pending = page.waitForRequest(
      (request) => new URL(request.url()).pathname === '/api/weather',
    );
    await page.goto(`${base}/en/weather/seoul-1835848`);
    await pending;
    await page.clock.fastForward(22_001);
    await page
      .locator('.weather-feedback')
      .filter({ hasText: labels('en').weather_timeout })
      .waitFor();
    assert.equal(await page.locator('.hour').count(), 24);
    assert(!(await page.getByTestId('forecast-refresh').isDisabled()));
    rows.push({ scenario: '浏览器请求超时停止等待并保留旧预报', timeoutMs: 22000 });
  } finally {
    await timed.close();
  }
  await age();
  await control(503);
  const switched = await context(390);
  let release = () => {};
  try {
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await switched.route('**/api/weather?*', async (route) => {
      await gate;
      try {
        await route.fulfill({
          json: { ...warm, version: 'late-old-city', current: { ...warm.current, temp: 999 } },
        });
      } catch {
        /* 切城后的旧请求允许取消。 */
      }
    });
    const page = await switched.newPage();
    const requested = page.waitForRequest(
      (request) => new URL(request.url()).pathname === '/api/weather',
    );
    await page.goto(`${base}/en/weather/seoul-1835848`);
    await requested;
    await control();
    await page.locator('.city-row a').filter({ hasText: 'Tokyo' }).click();
    await page.getByRole('heading', { name: 'Tokyo', level: 1, exact: true }).waitFor();
    release();
    await page.waitForTimeout(150);
    assert(!(await page.locator('.temperature').innerText()).includes('999'));
    assert((await page.locator('.weather-date').innerText()).includes('Asia/Tokyo'));
    assert.equal(await page.locator('.hour').count(), 24);
    rows.push({ scenario: '切城取消刷新，迟到旧城市天气不覆盖新页面' });
  } finally {
    release();
    await switched.close();
  }
  if (process.env.QA_REVIEW_RELATED === '1') {
    await control();
    const execute = promisify(execFile);
    for (const [script, env] of [
      ['qa/reverse-recovery-browser.ts', { QA_REVERSE_RUN: 'review-related-reverse' }],
      ['qa/location-grant-browser.ts', { QA_GRANT_RUN: 'review-related-grant' }],
    ] satisfies [string, Record<string, string>][]) {
      const result = await execute(process.execPath, [script], {
        cwd: root,
        env: { ...process.env, ...env, APP_URL: base },
        timeout: 180000,
      });
      console.log(script, result.stdout.trim());
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  for (const child of children.reverse()) {
    child.kill('SIGTERM');
    if (child.exitCode === null)
      await new Promise<void>((resolve) => child.once('exit', () => resolve()));
  }
  await log.close();
  await rm(directory, { recursive: true, force: true });
  await writeFile(
    path.join(evidence, `${run}-browser.json`),
    JSON.stringify({ at: new Date().toISOString(), checks: rows.length, rows, errors }, null, 2),
  );
}
console.log(
  JSON.stringify({
    checks: rows.length,
    errors,
    report: `qa/evidence/${run}-browser.json`,
  }),
);
