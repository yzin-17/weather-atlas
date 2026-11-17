import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { locales, isLocale } from '../web/lib/catalog.ts';
import { labels } from '../web/lib/ui-text.ts';

const base = process.env.APP_URL || 'http://127.0.0.1:3332';
const run = process.env.QA_REVERSE_RUN || 'reverse-recovery-browser';
assert(/^[a-z0-9-]+$/.test(run));
const point = { lat: 30.7513, lon: 106.2048 };
const coordinate = `${point.lat}, ${point.lon}`;
const names = { 'zh-Hans': '高坪区', 'zh-Hant': '高坪區', en: 'Gaoping District', ko: '가오핑구' };
const rows: Record<string, unknown>[] = [];
const errors: string[] = [];
const browser = await chromium.launch({ headless: true });
async function setup(width: number, mode: 'transient' | 'empty' | 'persistent' | 'late') {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: 'reduce',
  });
  let calls = 0,
    healthy = false;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requests: string[] = [];
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', { value: { saveData: true } });
  });
  await context.route('**/api/reverse?*', async (route) => {
    calls++;
    const url = new URL(route.request().url());
    requests.push(url.href);
    const locale = url.searchParams.get('lang');
    assert(isLocale(locale));
    if (mode === 'late') await gate;
    try {
      if (!healthy && (mode === 'persistent' || (calls === 1 && mode !== 'late')))
        await route.fulfill({
          json: { place: null, retryAfterMs: mode === 'empty' ? null : 1000 },
        });
      else
        await route.fulfill({
          json: {
            place: {
              name: names[locale],
              locale,
              region: '',
              country: '中国',
              level: 'region',
              source: 'photon-osm',
            },
            retryAfterMs: null,
          },
        });
    } catch {
      /* 已离开的页面允许取消旧请求。 */
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(18000);
  page.on('pageerror', (error) => errors.push(error.message));
  const weather: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/weather') weather.push(request.url());
  });
  return {
    context,
    page,
    requests,
    weather,
    count: () => calls,
    recover: () => {
      healthy = true;
    },
    release: () => release?.(),
  };
}
const url = (locale: string) =>
  `${base}/${locale}/explore?lat=${point.lat}&lon=${point.lon}&kind=pin&id=point`;
try {
  for (const width of [1440, 1024, 768, 390])
    for (const locale of locales) {
      const c = await setup(width, 'transient');
      try {
        await c.page.goto(url(locale));
        await c.page.getByRole('heading', { level: 1, name: coordinate, exact: true }).waitFor();
        const weatherBefore = c.weather.length;
        await c.page.getByRole('heading', { level: 1, name: names[locale], exact: true }).waitFor();
        assert.equal(c.count(), 2);
        assert.equal(c.weather.length, weatherBefore);
        assert.equal(await c.page.locator('.hour').count(), 24);
        assert.equal(await c.page.locator('.retry-city').count(), 0);
        assert.equal(
          await c.page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        assert(
          c.requests.every((request) => {
            const q = new URL(request).searchParams;
            return (
              q.get('lat') === String(point.lat) &&
              q.get('lon') === String(point.lon) &&
              q.get('lang') === locale
            );
          }),
        );
        if (locale === 'zh-Hans' && [1440, 390].includes(width))
          await c.page.screenshot({
            path: new URL(`./evidence/${run}-${width}.png`, import.meta.url).pathname,
          });
        rows.push({
          scenario: 'temporary-recovery',
          width,
          locale,
          heading: names[locale],
          requests: c.count(),
          extraWeatherRequests: c.weather.length - weatherBefore,
        });
      } finally {
        await c.context.close();
      }
    }
  {
    const c = await setup(390, 'persistent');
    try {
      await c.page.goto(url('zh-Hans'));
      await c.page.getByRole('heading', { name: coordinate, exact: true }).waitFor();
      await c.page.waitForTimeout(3800);
      assert.equal(c.count(), 3, '自动重试最多两次');
      assert.equal(await c.page.locator('.place-name-pending').count(), 0);
      c.recover();
      await c.page.evaluate(() => window.dispatchEvent(new Event('online')));
      await c.page.getByRole('heading', { name: names['zh-Hans'], exact: true }).waitFor();
      assert.equal(c.count(), 4);
      rows.push({
        scenario: 'bounded-retries-and-online-recovery',
        requests: c.count(),
        heading: names['zh-Hans'],
      });
    } finally {
      await c.context.close();
    }
  }
  {
    const c = await setup(390, 'empty');
    try {
      await c.page.goto(url('zh-Hant'));
      const retry = c.page.getByRole('button', { name: labels('zh-Hant').retryCity, exact: true });
      await retry.waitFor();
      await c.page.waitForTimeout(1300);
      assert.equal(c.count(), 1, '无覆盖不会自动循环查询');
      c.recover();
      await retry.focus();
      await c.page.keyboard.press('Enter');
      await c.page.getByRole('heading', { name: names['zh-Hant'], exact: true }).waitFor();
      assert.equal(c.count(), 2);
      rows.push({ scenario: 'empty-manual-retry-keyboard', requests: c.count() });
    } finally {
      await c.context.close();
    }
  }
  {
    const c = await setup(390, 'late');
    try {
      await c.page.goto(url('en'));
      await c.page.locator('.place-name-pending').waitFor();
      await c.page.locator('.finder').click();
      await c.page.getByRole('option').filter({ hasText: 'Tokyo' }).click();
      await c.page.getByRole('heading', { level: 1, name: 'Tokyo', exact: true }).waitFor();
      c.release();
      await c.page.waitForTimeout(300);
      assert.equal(await c.page.locator('h1').innerText(), 'Tokyo');
      assert.equal(c.count(), 1);
      rows.push({
        scenario: 'late-label-after-manual-city',
        heading: 'Tokyo',
        requests: c.count(),
      });
    } finally {
      c.release();
      await c.context.close();
    }
  }
  {
    const c = await setup(390, 'persistent');
    try {
      await c.page.goto(url('en'));
      await c.page.getByRole('heading', { name: coordinate, exact: true }).waitFor();
      await c.page.locator('.finder').click();
      await c.page.getByRole('option').filter({ hasText: 'Tokyo' }).click();
      await c.page.getByRole('heading', { level: 1, name: 'Tokyo', exact: true }).waitFor();
      await c.page.waitForTimeout(1600);
      assert.equal(c.count(), 1, '离开坐标页后取消重试定时器');
      rows.push({ scenario: 'queued-retry-cancelled-on-city-change', requests: c.count() });
    } finally {
      await c.context.close();
    }
  }
  {
    const c = await setup(390, 'late');
    try {
      await c.page.goto(url('zh-Hans'));
      await c.page.locator('.place-name-pending').waitFor();
      await c.page.locator('header select').selectOption('ko');
      await c.page.waitForURL('**/ko/explore?*');
      c.release();
      await c.page.getByRole('heading', { level: 1, name: names.ko, exact: true }).waitFor();
      assert.equal(c.count(), 2);
      assert.equal(await c.page.locator('h1').innerText(), names.ko);
      rows.push({
        scenario: 'late-result-after-language-change',
        heading: names.ko,
        requests: c.count(),
      });
    } finally {
      c.release();
      await c.context.close();
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await writeFile(
    new URL(`./evidence/${run}.json`, import.meta.url),
    JSON.stringify(
      { date: new Date().toISOString(), base, rows, errors, realModelCalls: 0 },
      null,
      2,
    ),
  );
}
console.log(JSON.stringify({ passed: rows.length, errors, realModelCalls: 0 }));
