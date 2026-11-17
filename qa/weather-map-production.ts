import { chromium } from 'playwright-core';
import { requireValue } from '../web/lib/validation.ts';
import { errorInfo } from '../web/lib/errors.ts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const base = process.env.APP_URL || 'http://127.0.0.1:3300';
const browser = await chromium.launch({ headless: true }),
  rows: (
    | {
        width: number;
        map: { x: number; y: number; width: number; height: number } | null;
        reading: string;
        tiles: { url: string; status: number; source: string; cache: string }[];
        dragWeatherDelta: number;
        testTiles: number;
      }
    | { scenario: string; passed: boolean }
  )[] = [],
  errors: string[] = [];
try {
  for (const width of [1440, 390] as const) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript(() =>
      Object.defineProperty(navigator, 'connection', { value: { saveData: true } }),
    );
    const page = await context.newPage(),
      requests: string[] = [],
      tiles: { url: string; status: number; source: string; cache: string }[] = [];
    page.on('request', (r) => requests.push(r.url()));
    page.on('response', (r) => {
      if (r.url().includes('/api/map-tiles/'))
        tiles.push({
          url: r.url(),
          status: r.status(),
          source: r.headers()['x-map-source'],
          cache: r.headers()['x-map-cache'],
        });
    });
    page.on('pageerror', (error) => errors.push(errorInfo(error).message));
    try {
      await page.goto(base + '/zh-Hans/weather/seoul-1835848');
      await page.locator('.hour').first().waitFor();
      assert.equal(requests.filter((u) => u.includes('/api/map-tiles/')).length, 0);
      await page.locator('.finder').click();
      await page.locator('.place-actions button').last().click();
      await page.waitForFunction(
        () =>
          document.querySelector('.map-selection-weather strong')?.textContent ===
          `${document.querySelector('.temperature > span')?.textContent}°`,
      );
      await page.waitForFunction(
        () => {
          const images = [
            ...document.querySelectorAll<HTMLImageElement>('.map-view img.leaflet-tile'),
          ];
          return images.length && images.every((i) => i.complete && i.naturalWidth === 256);
        },
        null,
        { timeout: 30000 },
      );
      assert.equal(await page.locator('.map-dialog select').count(), 0);
      assert(tiles.some((t) => t.status === 200 && t.source === 'openstreetmap'));
      assert.equal(requests.filter((u) => u.includes('/api/tiles/')).length, 0);
      const count = requests.filter((u) => u.includes('/api/weather')).length;
      const b = await page.locator('.map-view').boundingBox();
      await page.screenshot({
        path: new URL(`./evidence/weather-map-production-${width}.png`, import.meta.url).pathname,
      });
      await page.mouse.move(requireValue(b).x + 120, requireValue(b).y + 100);
      await page.mouse.down();
      await page.mouse.move(requireValue(b).x + 150, requireValue(b).y + 120, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(300);
      assert.equal(requests.filter((u) => u.includes('/api/weather')).length, count);
      rows.push({
        width,
        map: b,
        reading: await page.locator('.map-selection').innerText(),
        tiles,
        dragWeatherDelta: 0,
        testTiles: 0,
      });
    } finally {
      await context.close();
    }
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await context.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (success) => {
        window.__lateGPS = success;
      };
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(errorInfo(error).message));
    try {
      await page.goto(base + '/zh-Hans');
      await page.waitForFunction(() => typeof window.__lateGPS === 'function');
      await page.locator('.finder').click();
      await page.locator('.place-actions button').last().click();
      await page.locator('.map-dialog').waitFor();
      await page.evaluate(() =>
        window.__lateGPS({
          coords: {
            latitude: 25.0478,
            longitude: 121.5319,
            accuracy: 0,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON() {
              return { latitude: this.latitude, longitude: this.longitude };
            },
          },
          timestamp: Date.now(),
          toJSON() {
            return { coords: this.coords.toJSON(), timestamp: this.timestamp };
          },
        }),
      );
      await page.waitForTimeout(200);
      assert.equal(new URL(page.url()).pathname, '/zh-Hans');
      assert.equal(await page.locator('.map-dialog').isVisible(), true);
      rows.push({ scenario: 'opening map invalidates pending GPS', passed: true });
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await writeFile(
    new URL('./evidence/weather-map-production.json', import.meta.url),
    JSON.stringify(
      { date: new Date().toISOString(), base, rows, errors, realModelCalls: 0 },
      null,
      2,
    ),
  );
}
console.log(JSON.stringify({ passed: rows.length, errors, realModelCalls: 0 }));
