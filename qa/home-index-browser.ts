import { requireValue } from '../web/lib/validation.ts';
import { jsonObject, recordsAt } from './lib/json.ts';
import { chromium } from 'playwright-core';
import { errorInfo } from '../web/lib/errors.ts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { catalog, defaultCity, defaultCities, locales, localPlace } from '../web/lib/catalog.ts';
import { labels } from '../web/lib/ui-text.ts';

const base = process.env.APP_URL || 'http://127.0.0.1:3300';
const canonical = process.env.SITE_URL || 'http://localhost:3300';
const run = process.env.QA_HOME_BROWSER_RUN || 'home-index';
assert(/^[a-z0-9-]+$/.test(run));
const browser = await chromium.launch({ headless: true });
const rows: (
    | {
        width: number;
        locale: import('../web/lib/types.ts').Locale;
        index: boolean;
        explicitLanguageRespected: boolean;
        overflow: boolean;
        cityLinks: number;
      }
    | { scenario: string; passed: boolean }
  )[] = [],
  errors: string[] = [];
const denyAndPreferEnglish = () => {
  localStorage.setItem('wa.language', JSON.stringify('en'));
  Object.defineProperty(navigator, 'permissions', {
    value: { query: async () => Object.assign(new EventTarget(), { state: 'denied' }) },
  });
  navigator.geolocation.getCurrentPosition = (_success, fail) =>
    fail?.({
      code: 1,
      message: 'controlled geolocation error',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    });
};
try {
  for (const width of [1440, 1024, 768, 390] as const) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-US' });
    await context.addInitScript(denyAndPreferEnglish);
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(errorInfo(e).message));
    for (const locale of locales) {
      await page.goto(`${base}/${locale}`);
      await page.waitForLoadState('networkidle');
      assert.equal(new URL(page.url()).pathname, `/${locale}`);
      assert.equal(await page.locator('h1').count(), 1);
      assert.equal(await page.locator('h1').innerText(), labels(locale).homeTitle);
      assert.equal(
        await page.locator('.location-heading h2').innerText(),
        localPlace(defaultCity, locale).name,
      );
      assert.deepEqual(
        await page.locator('.home-intro nav a').allTextContents(),
        defaultCities.map((city) => localPlace(city, locale).name),
      );
      assert.equal(await page.locator('.home-intro nav a').count(), defaultCities.length);
      assert.equal(
        await page.locator('head link[rel=canonical]').getAttribute('href'),
        `${canonical}/${locale}`,
      );
      assert.equal(
        await page.locator('head meta[name=robots]').getAttribute('content'),
        'index, follow',
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      for (const link of await page.locator('.home-intro nav a').all()) {
        const box = await link.boundingBox();
        assert(box && box.height >= 44);
      }
      rows.push({
        width,
        locale,
        index: true,
        explicitLanguageRespected: true,
        overflow: false,
        cityLinks: defaultCities.length,
      });
      if (locale === 'zh-Hans')
        await page.screenshot({
          path: new URL(`./evidence/${run}-${width}.png`, import.meta.url).pathname,
          fullPage: true,
        });
    }
    if (width === 390) {
      for (const locale of locales) {
        await page.locator('#locale-select').selectOption(locale);
        await page.waitForURL(`${base}/${locale}`);
        try {
          await page.waitForFunction(
            (expected: string | undefined) =>
              document.querySelector('h1')?.textContent === expected,
            labels(locale).homeTitle,
          );
        } catch (error) {
          console.error(
            JSON.stringify({
              locale,
              url: page.url(),
              title: await page.locator('h1').allTextContents(),
              loading: await page.locator('.weather-loading').count(),
              errors,
            }),
          );
          throw error;
        }
        const expected = `${canonical}/${locale}`;
        await page.waitForFunction(
          (url) =>
            document.querySelector<HTMLLinkElement>('head link[rel=canonical]')?.href === url,
          expected,
        );
        assert.equal(await page.locator('script[type="application/ld+json"]').count(), 1);
        const graph = recordsAt(
          jsonObject(await page.locator('script[type="application/ld+json"]').innerText()),
          '@graph',
        );
        assert.equal(requireValue(graph.find((n) => n['@type'] === 'WebPage')).url, expected);
        assert(!graph.some((n) => n['@type'] === 'Place'));
      }
      await page.locator(`.home-intro a[href="/ko/weather/${catalog[0].slug}"]`).click();
      await page.waitForURL(`**/ko/weather/${catalog[0].slug}`);
      assert.equal(await page.locator('.home-intro').count(), 0);
      assert.equal(await page.locator('h1').innerText(), localPlace(catalog[0], 'ko').name);
      rows.push({ scenario: 'homepage language menu and actual city link', passed: true });
    }
    await context.close();
  }
  const restore = await browser.newContext({
    locale: 'en-US',
    permissions: ['geolocation'],
    geolocation: { latitude: 37.566, longitude: 126.9784 },
  });
  await restore.addInitScript(
    (place) => {
      localStorage.setItem('wa.language', JSON.stringify('en'));
      localStorage.setItem('wa.mode', JSON.stringify('manual'));
      localStorage.setItem('wa.last', JSON.stringify(place));
    },
    localPlace(catalog[2], 'en'),
  );
  const page = await restore.newPage();
  await page.goto(base + '/ko');
  await page.waitForURL('**/ko/explore?**');
  assert.equal(new URL(page.url()).searchParams.get('lat'), '37.566');
  assert.equal(new URL(page.url()).searchParams.get('lon'), '126.9784');
  rows.push({
    scenario: 'homepage GPS wins over saved Taipei and preserves explicit Korean URL',
    passed: true,
  });
  await restore.close();
  const gps = await browser.newContext({
    locale: 'en-US',
    permissions: ['geolocation'],
    geolocation: { latitude: 25.0478, longitude: 121.5319 },
  });
  const located = await gps.newPage();
  await located.goto(base + '/ko');
  await located.waitForURL('**/ko/explore?**');
  assert.equal(new URL(located.url()).searchParams.get('lat'), '25.0478');
  assert.equal(new URL(located.url()).searchParams.get('lon'), '121.5319');
  rows.push({
    scenario: 'authorized browser GPS preserves language and original coordinates',
    passed: true,
  });
  await gps.close();
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
await writeFile(
  new URL(`./evidence/${run}-browser.json`, import.meta.url),
  JSON.stringify({ at: new Date().toISOString(), base, rows, errors }, null, 2),
);
console.log('四语×四宽度首页、菜单与城市入口、当前位置优先和已授权定位通过');
