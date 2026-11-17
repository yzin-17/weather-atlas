import { chromium } from 'playwright-core';
import { requireValue } from '../web/lib/validation.ts';
import { isLocale, locales } from '../web/lib/catalog.ts';
import { decode } from '../web/lib/validation.ts';
import type { Locale } from '../web/lib/types.ts';
import { errorInfo } from '../web/lib/errors.ts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { labels } from '../web/lib/ui-text.ts';

const base = process.env.APP_URL || 'http://127.0.0.1:3332';
const run = process.env.QA_PLACE_RUN || 'place-loading';
assert(/^[a-z0-9-]+$/.test(run));
const browser = await chromium.launch({ headless: true });
const names = { 'zh-Hans': '成都', 'zh-Hant': '成都', en: 'Chengdu', ko: '청두' };
const lat = 30.5542,
  lon = 104.0596;
const makeLabel = (locale: Locale) => ({
  name: names[locale],
  names,
  locale,
  source: 'photon-osm',
  level: 'city',
  region: 'Sichuan',
  country: 'China',
});
const url = (locale: Locale = 'en', region = '') =>
  `${base}/${locale}/explore?lat=${lat}&lon=${lon}&kind=pin&id=point&region=${encodeURIComponent(region)}`;
const rows: (
    | {
        width: number;
        locale: Locale;
        pending: string;
        name: unknown;
        weatherWhileLoading: number;
        headingShiftPx: number;
        reverseRequests: number;
        weatherAPICalls: number;
        labelWeatherDelta: number;
      }
    | { scenario: string; fallback: string; spinnerEnded: boolean; weatherAvailable: boolean }
    | { scenario: string; reverseRequests: number; name: string }
    | { scenario: string; name: string; spinnerEnded: boolean }
  )[] = [],
  errors: string[] = [];
async function setup(width: number, mode = 'delayed', locale: Locale = 'en', cache = false) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: 'reduce',
  });
  let release: (() => void) | undefined;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const reverse: { [k: string]: string }[] = [],
    weather: (string | URL)[] = [];
  await context.addInitScript(
    ({ cache, lat, lon, locale, label }) => {
      try {
        // 省流量避免收藏页面预取干扰城市名专项的请求计数。
        Object.defineProperty(navigator, 'connection', { value: { saveData: true } });
        if (cache)
          localStorage.setItem(
            `wa.reverse-label.v2.${lat},${lon}.${locale}`,
            JSON.stringify({ at: Date.now(), place: label }),
          );
      } catch {}
    },
    { cache, lat, lon, locale, label: makeLabel(locale) },
  );
  await context.route('**/api/reverse?*', async (route) => {
    reverse.push(Object.fromEntries(new URL(route.request().url()).searchParams));
    if (mode === 'delayed' || mode === 'timeout') await gate;
    try {
      if (mode === 'failure') await route.fulfill({ status: 503, json: { error: 'controlled' } });
      else if (mode === 'empty') await route.fulfill({ json: { place: null } });
      else
        await route.fulfill({
          json: {
            place: makeLabel(
              decode(new URL(route.request().url()).searchParams.get('lang') || 'en', isLocale),
            ),
          },
        });
    } catch {}
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => errors.push(errorInfo(e).message));
  page.on('request', (r: { url: () => string | URL }) => {
    if (new URL(r.url()).pathname === '/api/weather') weather.push(r.url());
  });
  return { context, page, release, reverse, weather };
}
try {
  for (const width of [1440, 1024, 768, 390] as const)
    for (const locale of locales) {
      const c = await setup(width, 'delayed', locale);
      try {
        await c.page.goto(url(locale));
        const pending = c.page.locator('h1 .place-name-pending');
        await pending.waitFor();
        assert.equal(await pending.innerText(), labels(locale).resolvingCity);
        assert.equal(await c.page.locator('h1').getAttribute('aria-busy'), 'true');
        assert(!(await c.page.locator('h1').innerText()).includes(String(lat)));
        await c.page.locator('.hours .hour').first().waitFor();
        assert.equal(await c.page.locator('.hours .hour').count(), 24);
        const weatherBefore = c.weather.length;
        const before = await c.page.locator('.weather-date').boundingBox();
        assert.equal(
          await c.page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        assert.equal(
          await pending.locator('i').evaluate((el: Element) => getComputedStyle(el).animationName),
          'none',
        );
        if (locale === 'zh-Hans' && [1440, 390].includes(width))
          await c.page.screenshot({
            path: new URL(`./evidence/${run}-${width}.png`, import.meta.url).pathname,
          });
        requireValue(c.release)();
        await c.page.getByRole('heading', { level: 1, name: names[locale], exact: true }).waitFor();
        assert.equal(await c.page.locator('h1').getAttribute('aria-busy'), 'false');
        const after = await c.page.locator('.weather-date').boundingBox();
        const lineHeight = await c.page
          .locator('h1')
          .evaluate((el: Element) => parseFloat(getComputedStyle(el).lineHeight));
        // 未知城市名可能自然换行；占位保留一行，不为所有地点预留多行空白。
        assert(
          Math.abs(requireValue(before).y - requireValue(after).y) <= lineHeight + 2,
          '标题切换最多增加一行',
        );
        assert.equal(
          await c.page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        if (locale === 'en' && width === 390)
          await c.page.screenshot({
            path: new URL(`./evidence/${run}-390-resolved-en.png`, import.meta.url).pathname,
          });
        assert.equal(c.reverse.length, 1);
        assert.equal(c.reverse[0].lat, String(lat));
        assert.equal(c.reverse[0].lon, String(lon));
        assert.equal(c.weather.length, weatherBefore);
        assert(
          c.weather.every((u) => {
            const params = new URL(u).searchParams;
            return params.get('lat') === String(lat) && params.get('lon') === String(lon);
          }),
        );
        rows.push({
          width,
          locale,
          pending: labels(locale).resolvingCity,
          name: names[locale],
          weatherWhileLoading: 24,
          headingShiftPx: requireValue(after).y - requireValue(before).y,
          reverseRequests: 1,
          weatherAPICalls: c.weather.length,
          labelWeatherDelta: c.weather.length - weatherBefore,
        });
      } finally {
        await c.context.close();
      }
    }
  for (const [mode, region, expected] of [
    ['failure', 'Sichuan', 'Sichuan'],
    ['empty', '', `${lat.toFixed(4)}, ${lon.toFixed(4)}`],
    ['timeout', '', `${lat.toFixed(4)}, ${lon.toFixed(4)}`],
  ] as const) {
    const c = await setup(390, mode);
    try {
      await c.page.goto(url('en', region));
      await c.page.getByRole('heading', { level: 1, name: expected, exact: true }).waitFor();
      assert.equal(await c.page.locator('.place-name-pending').count(), 0);
      assert.equal(await c.page.locator('.hour').count(), 24);
      requireValue(c.release)();
      await c.page.waitForTimeout(100);
      assert.equal(await c.page.locator('h1').innerText(), expected);
      rows.push({ scenario: mode, fallback: expected, spinnerEnded: true, weatherAvailable: true });
    } finally {
      requireValue(c.release)();
      await c.context.close();
    }
  }
  {
    const c = await setup(390, 'failure', 'en', true);
    try {
      await c.page.goto(url());
      await c.page.getByRole('heading', { level: 1, name: 'Chengdu', exact: true }).waitFor();
      assert.equal(c.reverse.length, 0);
      assert.equal(await c.page.locator('.place-name-pending').count(), 0);
      rows.push({ scenario: 'cached-name', reverseRequests: 0, name: 'Chengdu' });
    } finally {
      await c.context.close();
    }
  }
  {
    const c = await setup(390);
    try {
      await c.page.goto(url());
      await c.page.locator('.place-name-pending').waitFor();
      await c.page.locator('.finder').click();
      await c.page.getByRole('option').filter({ hasText: 'Seoul' }).click();
      await c.page.getByRole('heading', { level: 1, name: 'Seoul', exact: true }).waitFor();
      requireValue(c.release)();
      await c.page.waitForTimeout(200);
      assert.equal(await c.page.locator('h1').innerText(), 'Seoul');
      assert.equal(await c.page.locator('.place-name-pending').count(), 0);
      rows.push({ scenario: 'late-result-after-city-change', name: 'Seoul', spinnerEnded: true });
    } finally {
      requireValue(c.release)();
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
