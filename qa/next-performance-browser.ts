import { readForecast } from './lib/json.ts';
import { textAt, jsonObject } from './lib/json.ts';
import { chromium } from 'playwright-core';
import { requireValue } from '../web/lib/validation.ts';
import type { Place, Forecast } from '../web/lib/types.ts';
interface ScenarioConfig {
  width?: number;
  saved?: Place[];
  connection?: { saveData?: boolean; effectiveType?: string };
  hidden?: boolean;
  offline?: boolean;
  snapshots?: Record<string, Forecast>;
  failPrefetch?: boolean;
}
interface ScenarioInput {
  page: Page;
  context: BrowserContext;
  requests: { url: string; type: string }[];
  rsc: () => string[];
}
import { errorInfo } from '../web/lib/errors.ts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { catalog, localPlace, placeURL, locales } from '../web/lib/catalog.ts';
import { type Locale } from '../web/lib/types.ts';
import type { Page, BrowserContext } from 'playwright-core';

const base = process.env.APP_URL || 'http://127.0.0.1:3332';
const browser = await chromium.launch({ headless: true });
const results: { name: string; passed: boolean }[] = [],
  errors: { name: string; error: string }[] = [];
const saved = catalog.map((p) => localPlace(p, 'en'));
const seoul = saved[0],
  taipei = saved[2];
async function scenario(
  name: string,
  config: ScenarioConfig,
  run: (input: ScenarioInput) => Promise<object>,
) {
  const context = await browser.newContext({
    viewport: { width: config.width || 1440, height: 1000 },
  });
  await context.addInitScript(
    ({ saved, connection, hidden, offline, snapshots }) => {
      try {
        localStorage.setItem('wa.saved', JSON.stringify(saved));
        for (const [key, value] of Object.entries(snapshots || {}))
          localStorage.setItem('wa.' + key, JSON.stringify(value));
      } catch {}
      if (connection) Object.defineProperty(navigator, 'connection', { value: connection });
      if (hidden) Object.defineProperty(document, 'visibilityState', { get: () => 'hidden' });
      if (offline) Object.defineProperty(navigator, 'onLine', { get: () => false });
      navigator.geolocation.getCurrentPosition = (_success, fail) =>
        fail?.({
          code: 1,
          message: 'controlled geolocation error',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
    },
    { saved: config.saved || saved, ...config },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const requests: { url: string; type: string }[] = [];
  page.on('pageerror', (e) => errors.push({ name, error: errorInfo(e).message }));
  page.on('request', (r) => requests.push({ url: r.url(), type: r.resourceType() }));
  if (config.failPrefetch)
    await page.route('**/*_rsc=*', (route) =>
      route.request().headers()['next-router-prefetch'] ? route.abort('failed') : route.continue(),
    );
  // 地图瓦片使用透明受控响应，检查发出请求即可；不访问第三方瓦片。
  await page.route(/tile\.openstreetmap\.org|\/api\/map-tiles\//, (r) =>
    r.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6U0kAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  const rsc = () => [
    ...new Set(
      requests
        .filter((r) => r.url.includes('_rsc='))
        .map((r) => {
          const u = new URL(r.url);
          u.searchParams.delete('_rsc');
          return u.pathname + u.search;
        }),
    ),
  ];
  try {
    await page.goto(base + placeURL('en', seoul));
    await page.waitForFunction(() => !!localStorage.getItem('wa.weather.37.566,126.9784'));
    await page.waitForTimeout(1800);
    const details = await run({ page, context, requests, rsc });
    results.push({ name, passed: true, ...details });
    console.log(name + '：通过');
  } finally {
    await context.close();
  }
}
try {
  const many = [
    ...saved,
    ...Array.from({ length: 94 }, (_, i) => ({
      id: `test-${i}`,
      lat: 10 + i / 10,
      lon: 90 + i / 10,
      name: `Test ${i}`,
      country: '',
    })),
  ];
  await scenario('100 收藏仅预取两座可见城市', { saved: many }, async ({ page, rsc, requests }) => {
    assert.equal(rsc().length, 2);
    const auto = rsc();
    const target = page.locator(`.city-row a[href="${placeURL('en', saved[3])}"]`);
    await target.focus();
    await page.waitForTimeout(500);
    await target.hover();
    await page.waitForTimeout(500);
    await target.dispatchEvent('touchstart');
    await page.waitForTimeout(300);
    assert.equal(rsc().length, 3);
    assert.equal(
      requests.filter((r: { url: string | string[] }) => r.url.includes('/api/ask')).length,
      0,
    );
    return {
      auto,
      withIntent: rsc(),
      summaryBatches: requests.filter((r: { url: string | string[] }) =>
        r.url.includes('/api/summaries'),
      ).length,
    };
  });
  await scenario('窄屏未滚动不预取屏外城市', { width: 390 }, async ({ rsc }) => {
    assert.equal(rsc().length, 0);
    return { rsc: 0 };
  });
  await scenario('停止注册后复用预取且过期不后台轮询', {}, async ({ page, requests, rsc }) => {
    assert.equal(rsc().length, 2);
    await page.waitForTimeout(9000);
    const count = requests.filter((r: { url: string | string[] }) =>
      r.url.includes('_rsc='),
    ).length;
    await page.locator(`.city-row a[href="${placeURL('en', taipei)}"]`).click();
    await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Taipei');
    assert.equal(
      requests.filter((r: { url: string | string[] }) => r.url.includes('_rsc=')).length,
      count,
    );
    // 不让新页面的候选预热影响观察窗口。
    await page.locator('.finder').click();
    await page.waitForTimeout(62000);
    assert.equal(
      requests.filter((r: { url: string | string[] }) => r.url.includes('_rsc=')).length,
      count,
    );
    return { rscBeforeClick: count, clickExtraRSC: 0, idleAfterExpiryMs: 62000, pollingRSC: 0 };
  });
  await scenario('预取失败仍可点击恢复导航', { failPrefetch: true }, async ({ page }) => {
    await page.unroute('**/*_rsc=*');
    await page.locator(`.city-row a[href="${placeURL('en', taipei)}"]`).click();
    await page.waitForFunction(
      () =>
        document.querySelector('h1')?.textContent === 'Taipei' &&
        document.querySelector('.weather-date')?.textContent.includes('Asia/Taipei'),
    );
    assert.equal(await page.locator('.temperature > span').first().innerText(), '8');
    return { recovered: true, temp: 8, timezone: 'Asia/Taipei' };
  });
  for (const [name, config] of [
    ['省流量', { connection: { saveData: true, effectiveType: '4g' } }],
    ['2g', { connection: { effectiveType: '2g' } }],
    ['隐藏页面', { hidden: true }],
    ['离线状态', { offline: true }],
  ] as const)
    await scenario(name + '停止投机预取', config, async ({ page, rsc }) => {
      await page.locator('.city-row a').first().hover();
      await page.waitForTimeout(600);
      assert.equal(rsc().length, 0);
      return { rsc: 0 };
    });
  await scenario(
    '3g 仅明确意图预取',
    { connection: { effectiveType: '3g' } },
    async ({ page, rsc }) => {
      assert.equal(rsc().length, 0);
      await page.locator('.city-row a').first().focus();
      await page.waitForTimeout(700);
      assert.equal(rsc().length, 1);
      return { rsc: 1 };
    },
  );
  const snapshot = await readForecast(
    await fetch(`${base}/api/weather?lat=${taipei.lat}&lon=${taipei.lon}`),
  );
  await scenario(
    '完整快照提供摘要无需摘要 API',
    {
      saved: [seoul, taipei],
      snapshots: { [`weather.${taipei.lat},${taipei.lon}`]: snapshot },
      connection: { saveData: true },
    },
    async ({ page, requests }) => {
      assert.equal(await page.locator('.city-row strong').innerText(), '8°');
      assert.equal(
        requests.filter((r: { url: string | string[] }) => r.url.includes('/api/summaries')).length,
        0,
      );
      return { summaryRequests: 0, temp: '8°' };
    },
  );
  await scenario(
    '演示快照不能污染真实城市摘要',
    {
      saved: [seoul, taipei],
      snapshots: {
        [`weather.${taipei.lat},${taipei.lon}`]: {
          ...snapshot,
          source: 'demo',
          current: { ...snapshot.current, temp: 99 },
        },
      },
      connection: { saveData: true },
    },
    async ({ page, requests }) => {
      assert.equal(await page.locator('.city-row strong').innerText(), '8°');
      assert.equal(
        requests.filter((r: { url: string | string[] }) => r.url.includes('/api/summaries')).length,
        1,
      );
      return { summaryRequests: 1, temp: '8°' };
    },
  );
  const current = await readForecast(
    await fetch(`${base}/api/weather?lat=${seoul.lat}&lon=${seoul.lon}`),
  );
  await scenario(
    '旧路由不覆盖较新的同城快照',
    {
      snapshots: {
        [`weather.${seoul.lat},${seoul.lon}`]: {
          ...current,
          fetchedAt: new Date().toISOString(),
          version: 'browser-newer',
          current: { ...current.current, temp: 99 },
        },
      },
      connection: { saveData: true },
    },
    async ({ page }) => {
      assert.equal(await page.locator('.temperature > span').first().innerText(), '99');
      assert.equal(
        textAt(
          jsonObject(
            await page.evaluate(() => localStorage.getItem('wa.weather.37.566,126.9784') || 'null'),
          ),
          'version',
        ),
        'browser-newer',
      );
      return { temp: 99, version: 'browser-newer' };
    },
  );
  await scenario('弹窗意图预热不请求地图瓦片或模型', { width: 390 }, async ({ page, requests }) => {
    assert.equal(
      requests.filter((r: { url: string }) =>
        /tile\.openstreetmap|\/api\/map-tiles\/|\/api\/tiles\//.test(r.url),
      ).length,
      0,
    );
    const scriptsBefore = requests.filter((r: { type: string }) => r.type === 'script').length;
    await page.locator('.finder').focus();
    await page.waitForTimeout(400);
    const scriptsWarmed =
      requests.filter((r: { type: string }) => r.type === 'script').length - scriptsBefore;
    assert(scriptsWarmed > 0);
    assert.equal(
      requests.filter((r: { url: string }) =>
        /tile\.openstreetmap|\/api\/map-tiles\/|\/api\/tiles\//.test(r.url),
      ).length,
      0,
    );
    const weatherBefore = requests.filter((r: { url: string | string[] }) =>
      r.url.includes('/api/weather'),
    ).length;
    await page.locator('.finder').click();
    await page.locator('.place-actions button').last().click();
    await page.locator('.leaflet-container').waitFor();
    await page.waitForTimeout(400);
    const tileRequests = requests.filter((r: { url: string }) =>
      /tile\.openstreetmap|\/api\/map-tiles\/|\/api\/tiles\//.test(r.url),
    ).length;
    assert(tileRequests > 0);
    const map = page.locator('.leaflet-container'),
      box = await map.boundingBox();
    await page.mouse.move(requireValue(box).x + 100, requireValue(box).y + 100);
    await page.mouse.down();
    await page.mouse.move(requireValue(box).x + 150, requireValue(box).y + 140, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    assert.equal(
      requests.filter((r: { url: string | string[] }) => r.url.includes('/api/weather')).length,
      weatherBefore,
    );
    await page.locator('.dialog-heading .icon-btn').click();
    await page.locator('.ask-launcher').focus();
    await page.waitForTimeout(200);
    assert.equal(
      requests.filter((r: { url: string | string[] }) => r.url.includes('/api/ask')).length,
      0,
    );
    return {
      scriptsWarmed,
      tilesBeforeOpen: 0,
      tileRequests,
      dragWeatherRequests: 0,
      modelCalls: 0,
    };
  });
  await scenario(
    '四宽度四语切城及元数据',
    { connection: { saveData: true } },
    async ({ page, requests }) => {
      const checks: { width: number; locale: Locale }[] = [];
      for (const width of [1440, 1024, 768, 390] as const) {
        await page.setViewportSize({ width, height: 900 });
        for (const locale of locales) {
          await page.locator('#locale-select').selectOption(locale);
          await page.waitForFunction(
            (locale: string) =>
              document.documentElement.lang === locale && document.querySelector('h1')?.textContent,
            locale,
          );
          await page.waitForTimeout(150);
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false,
          );
          assert.equal(await page.locator('.ask-launcher').count(), 1);
          assert.equal(await page.locator('.ask-link').count(), 0);
          assert.equal(
            await page.locator('head link[rel=canonical]').getAttribute('href'),
            `http://localhost:3300${placeURL(locale, localPlace(catalog[0], locale))}`,
          );
          assert.equal(await page.locator('script[type="application/ld+json"]').count(), 1);
          checks.push({ width, locale });
        }
        await page.screenshot({
          path: new URL(`./evidence/next-performance-${width}.png`, import.meta.url).pathname,
          fullPage: true,
        });
      }
      assert.equal(
        requests.filter((r: { url: string | string[] }) => r.url.includes('/api/weather')).length,
        0,
      );
      return { checks, languageWeatherAPICalls: 0 };
    },
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await writeFile(
    new URL('./evidence/next-performance-browser.json', import.meta.url),
    JSON.stringify(
      { date: new Date().toISOString(), base, results, errors, realModelCalls: 0 },
      null,
      2,
    ),
  );
}
