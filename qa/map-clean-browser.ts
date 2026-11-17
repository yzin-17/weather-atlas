import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { locales } from '../web/lib/catalog.ts';
import { labels } from '../web/lib/ui-text.ts';
import { requireValue } from '../web/lib/validation.ts';

const base = process.env.APP_URL || 'http://127.0.0.1:3332';
const browser = await chromium.launch({ headless: true });
const rows: object[] = [],
  errors: string[] = [];
try {
  for (const width of [1440, 1024, 768, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'connection', { value: { saveData: true } });
      });
      const page = await context.newPage();
      const requests: string[] = [];
      page.on('request', (r) => requests.push(r.url()));
      page.on('pageerror', (e) => errors.push(e.message));
      for (const locale of locales) {
        const navigationStart = requests.length;
        await page.goto(`${base}/${locale}/weather/seoul-1835848`);
        await page.locator('.hour').first().waitFor();
        await page.waitForLoadState('networkidle');
        assert.equal(
          requests.slice(navigationStart).filter((u) => u.includes('/api/map-tiles/')).length,
          0,
        );
        assert.equal(await page.locator('.map-entry').count(), 0);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        if (locale === 'zh-Hans') {
          await page.screenshot({
            path: new URL(`./evidence/map-entry-cleanup-${width}.png`, import.meta.url).pathname,
          });
        }
        const before = requests.length;
        await page.locator('.finder').click();
        await page.locator('.place-actions button').last().click();
        await page.locator('.leaflet-control-zoom-in').waitFor();
        await page.waitForFunction(() =>
          [...document.querySelectorAll<HTMLImageElement>('.map-view img.leaflet-tile')].some(
            (img) => img.complete && img.naturalWidth === 256,
          ),
        );
        assert.equal(
          await page
            .locator('.map-weather-chip, .map-selection-weather, .weather-map-marker')
            .count(),
          0,
        );
        assert.equal(await page.locator('.map-view .leaflet-interactive').count(), 0);
        assert.equal(await page.locator('.map-dialog select').count(), 0);
        assert.equal(await page.locator('.map-stage .map-selection').count(), 0);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        const map = requireValue(await page.locator('.map-view').boundingBox());
        assert(map.width > width - (width > 1000 ? 500 : 100));
        assert(map.height > 350);
        const budget = requests.slice(before).filter((u) => /\/api\/(weather|summaries)\?/.test(u));
        assert.equal(budget.length, 0);
        const count = requests.length;
        await page.mouse.move(map.x + map.width * 0.6, map.y + map.height * 0.4);
        await page.mouse.down();
        await page.mouse.move(map.x + map.width * 0.65, map.y + map.height * 0.45, { steps: 8 });
        await page.mouse.up();
        await page.locator('.leaflet-control-zoom-in').click();
        await page.waitForTimeout(200);
        assert.equal(
          requests.slice(count).filter((u) => /\/api\/(weather|summaries)\?/.test(u)).length,
          0,
        );
        if (locale === 'zh-Hans') {
          await page.waitForFunction(() => {
            const tiles = [
              ...document.querySelectorAll<HTMLImageElement>('.map-view img.leaflet-tile'),
            ];
            return (
              tiles.length > 0 && tiles.every((img) => img.complete && img.naturalWidth === 256)
            );
          });
          await page.screenshot({
            path: new URL(`./evidence/map-clean-${width}.png`, import.meta.url).pathname,
          });
        }
        rows.push({
          width,
          locale,
          map,
          weatherMarkers: 0,
          overlayWeather: 0,
          mapWeatherRequests: 0,
        });
        await page.getByRole('button', { name: labels(locale).close, exact: true }).click();
      }
      if (width === 390) {
        await page.goto(`${base}/zh-Hans/weather/seoul-1835848`);
        await page.locator('.finder').click();
        await page.locator('.place-actions button').last().click();
        const fields = page.locator('.coordinate-entry input');
        await fields.nth(0).fill('23.11');
        await fields.nth(1).fill('114.41');
        await fields.nth(1).blur();
        const before = requests.length;
        await page.locator('.map-selection .primary').click();
        await page.waitForURL('**/zh-Hans/explore?**');
        await page.getByRole('heading', { level: 1, name: '惠州市' }).waitFor({ timeout: 20000 });
        const url = new URL(page.url());
        assert.equal(url.searchParams.get('lat'), '23.11');
        assert.equal(url.searchParams.get('lon'), '114.41');
        const forecast = requests
          .slice(before)
          .filter((u) => u.includes('/api/weather?'))
          .map((u) => Object.fromEntries(new URL(u).searchParams));
        // 坐标页由 SSR 读取预报，浏览器可能没有额外 /api/weather 请求。
        assert(forecast.every((p) => p.lat === '23.11' && p.lon === '114.41'));
        assert.match(await page.locator('.temperature').innerText(), /8/);
        rows.push({
          scenario: '真实惠州地名解析',
          name: '惠州市',
          coords: [23.11, 114.41],
          forecast,
        });
        await page.screenshot({
          path: new URL('./evidence/map-clean-huizhou.png', import.meta.url).pathname,
        });
      }
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks: rows.length, errors }));
} finally {
  await browser.close();
  await writeFile(
    new URL('./evidence/map-clean-browser.json', import.meta.url),
    JSON.stringify(
      {
        time: new Date().toISOString(),
        rows,
        errors,
        weather: '受控天气，真实 OSM 与 Photon 地名',
      },
      null,
      2,
    ),
  );
}
