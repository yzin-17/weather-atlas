import { recordsAt, parseJson } from './lib/json.ts';
import { chromium } from 'playwright-core';
import { requireValue } from '../web/lib/validation.ts';
import { isLocale } from '../web/lib/catalog.ts';
import { decode } from '../web/lib/validation.ts';
import type { Locale } from '../web/lib/types.ts';
import { errorInfo } from '../web/lib/errors.ts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { type Page } from 'playwright-core';

const base = process.env.APP_URL || 'http://127.0.0.1:3307',
  browser = await chromium.launch({ headless: true }),
  rows: (
    | {
        width: number;
        scenario: string;
        reverse: { [k: string]: string }[];
        languageWeatherDelta: number;
        shared: string;
        first: string;
        errors: never[];
      }
    | { scenario: string; heading: string; weatherAvailable: boolean }
    | { scenario: string; heading: string; url: string }
    | { scenario: string; heading: string; saved: string; renameWeatherSummaryDelta: number }
    | { scenario: string; heading: string; url: string; reverse: { [k: string]: string }[] }
  )[] = [];
const names = { en: 'Taipei', 'zh-Hans': '台北', 'zh-Hant': '臺北', ko: '타이베이' };
const label = (lang: string | number | null) => ({
  name: names[decode(lang || 'en', isLocale)],
  country: 'Taiwan',
  region: 'Zhongshan',
  locale: lang,
  names,
  source: 'photon-osm',
  level: 'city',
});
const point = (lang = 'en', region = '') =>
  `${base}/${lang}/explore?lat=25.0478&lon=121.5319&id=point&kind=pin&region=${encodeURIComponent(region)}`;
async function context(width: number, mode = 'ok') {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    permissions: ['geolocation', 'clipboard-read', 'clipboard-write'],
    geolocation: { latitude: 25.0478, longitude: 121.5319 },
  });
  const calls: { [k: string]: string }[] = [],
    errors: string[] = [];
  let release: (() => void) | undefined;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await context.route('**/api/reverse?*', async (route) => {
    const url = new URL(route.request().url()),
      lang = url.searchParams.get('lang');
    calls.push(Object.fromEntries(url.searchParams));
    if (mode === 'late') await delayed;
    try {
      if (mode === 'offline') return await route.abort('failed');
      await route.fulfill({ json: { place: mode === 'empty' ? null : label(lang) } });
    } catch {
      /* 离开页面后的旧请求不再影响界面。 */
    }
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(errorInfo(e).message));
  const weather: (string | URL)[] = [],
    summaries: (string | URL)[] = [];
  page.on('request', (r: { url: () => string | URL }) => {
    if (new URL(r.url()).pathname === '/api/weather') weather.push(r.url());
    if (new URL(r.url()).pathname === '/api/summaries') summaries.push(r.url());
  });
  return { context, page, calls, errors, weather, summaries, release };
}
async function title(page: Page, name: string) {
  await page.getByRole('heading', { level: 1, name, exact: true }).waitFor({ timeout: 15000 });
}
try {
  for (const width of [1440, 390] as const) {
    const c = await context(width),
      { page } = c;
    await page.goto(base + '/en/weather/seoul-1835848');
    await title(page, 'Seoul');
    assert.equal(c.calls.length, 0);
    await page.locator('.finder').click();
    await page.locator('.place-actions button').last().click();
    await page.locator('.leaflet-container').waitFor();
    const b = await page.locator('.leaflet-container').boundingBox();
    await page.mouse.move(
      requireValue(b).x + requireValue(b).width * 0.5,
      requireValue(b).y + requireValue(b).height * 0.5,
    );
    await page.mouse.down();
    await page.mouse.move(
      requireValue(b).x + requireValue(b).width * 0.65,
      requireValue(b).y + requireValue(b).height * 0.6,
      { steps: 8 },
    );
    await page.mouse.up();
    assert.equal(c.calls.length, 0);
    assert.equal(c.weather.length, 0);
    const inputs = page.locator('.coordinate-entry input');
    await inputs.nth(0).fill('25.0478');
    await inputs.nth(1).fill('121.5319');
    assert.equal(c.calls.length, 0);
    await page.locator('.dialog .primary').click();
    await title(page, 'Taipei');
    assert(c.calls.every((p) => p.lat === '25.0478' && p.lon === '121.5319'));
    const first = await page.locator('.temperature').innerText();
    const before = c.weather.length;
    for (const lang of ['zh-Hans', 'zh-Hant', 'ko', 'en'] as const) {
      await page.locator('#locale-select').selectOption(lang);
      await title(page, names[lang]);
    }
    assert.equal(c.weather.length, before);
    await page.locator('button.save').click();
    const saved = recordsAt(
      parseJson(await page.evaluate(() => localStorage.getItem('wa.saved') || 'null')),
    );
    const p = saved.find((p) => p.id === 'point' || String(p.id).startsWith('pin-'));
    assert(p);
    assert.equal(p.lat, 25.0478);
    assert.equal(p.lon, 121.5319);
    assert.equal(p.name, 'Taipei');
    await page.locator('.location-actions .icon-btn').click();
    const shared = await page.evaluate(() => navigator.clipboard.readText());
    assert(new URL(shared).pathname.endsWith('/explore'));
    assert.equal(new URL(shared).searchParams.get('lat'), '25.0478');
    await page.reload();
    await title(page, 'Taipei');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.deepEqual(c.errors, []);
    await page.screenshot({
      path: new URL(`./evidence/reverse-web-${width}.png`, import.meta.url).pathname,
    });
    rows.push({
      width,
      scenario: 'map and four languages',
      reverse: c.calls,
      languageWeatherDelta: c.weather.length - before,
      shared,
      first,
      errors: c.errors,
    });
    await c.context.close();
  }
  for (const [mode, region, expected] of [
    ['offline', 'Known region', 'Known region'],
    ['empty', '', '25.0478, 121.5319'],
  ] as const) {
    const c = await context(390, mode);
    await c.page.goto(point('en', region) + '&name=Unverified%20city&labelLocale=en');
    await title(c.page, expected);
    await c.page.locator('.hours').waitFor();
    assert.deepEqual(c.errors, []);
    assert.equal(
      await c.page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    rows.push({
      scenario: mode,
      heading: await c.page.locator('h1').innerText(),
      weatherAvailable: true,
    });
    await c.context.close();
  }
  {
    const c = await context(390, 'late');
    await c.page.goto(point());
    await c.page.locator('.place-name-pending').waitFor();
    await c.page.locator('.finder').click();
    await c.page.getByRole('option').filter({ hasText: 'Seoul' }).click();
    await title(c.page, 'Seoul');
    requireValue(c.release)();
    await c.page.waitForTimeout(250);
    await title(c.page, 'Seoul');
    assert(c.page.url().includes('/weather/seoul-1835848'));
    rows.push({ scenario: 'late label after manual city', heading: 'Seoul', url: c.page.url() });
    await c.context.close();
  }
  {
    const c = await context(390, 'late');
    await c.page.goto(base + '/en/weather/seoul-1835848');
    await title(c.page, 'Seoul');
    await c.page.locator('.other-cities .section-heading button').click();
    await c.page.locator('.place-actions button').last().click();
    const inputs = c.page.locator('.coordinate-entry input');
    await inputs.nth(0).fill('25.0478');
    await inputs.nth(1).fill('121.5319');
    const response = c.page.waitForResponse(
      (r: { url: () => string | URL }) =>
        new URL(r.url()).pathname === '/api/summaries' &&
        decodeURIComponent(String(r.url())).includes('25.0478'),
    );
    await c.page.locator('.dialog .primary').click();
    await c.page.locator('.city-label b').filter({ hasText: '25.0478, 121.5319' }).waitFor();
    await (await response).finished();
    await c.page.waitForTimeout(100);
    const before = c.summaries.length;
    requireValue(c.release)();
    await c.page.locator('.city-label b').filter({ hasText: 'Taipei' }).waitFor();
    await title(c.page, 'Seoul');
    await c.page.waitForTimeout(150);
    assert.equal(c.summaries.length, before);
    rows.push({
      scenario: 'saved map point renamed without switching current city',
      heading: 'Seoul',
      saved: 'Taipei',
      renameWeatherSummaryDelta: 0,
    });
    await c.context.close();
  }
  {
    const c = await context(390);
    await c.page.goto(base + '/en');
    await title(c.page, 'Taipei');
    const url = new URL(c.page.url());
    assert.equal(url.searchParams.get('kind'), 'gps');
    assert.equal(url.searchParams.get('lat'), '25.0478');
    rows.push({
      scenario: 'authorized GPS',
      heading: 'Taipei',
      url: c.page.url(),
      reverse: c.calls,
    });
    await c.context.close();
  }
} finally {
  await browser.close();
  await writeFile(
    new URL('./evidence/reverse-browser.json', import.meta.url),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        weather: process.env.QA_WEATHER_LABEL || 'production server / real cached weather',
        labels: 'controlled browser responses',
        rows,
      },
      null,
      2,
    ),
  );
}
console.log(
  JSON.stringify(
    rows.map(
      (row: {
        scenario: string;
        width?: number;
        heading?: string;
        languageWeatherDelta?: number;
      }) => ({
        scenario: row.scenario,
        width: row.width,
        heading: row.heading,
        languageWeatherDelta: row.languageWeatherDelta,
      }),
    ),
  ),
);
