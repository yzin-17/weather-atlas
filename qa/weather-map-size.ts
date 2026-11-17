import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const base = process.env.APP_URL || 'http://127.0.0.1:3300';
const run = process.env.QA_MAP_SIZE_RUN || 'after';
assert(['before', 'after'].includes(run));
const browser = await chromium.launch({ headless: true }),
  rows: {
    width: number;
    viewportHeight: number;
    dialog: { x: number; y: number; width: number; height: number } | null;
    map: { x: number; y: number; width: number; height: number } | null;
    mapLanguageSelectors: number;
  }[] = [];
try {
  for (const width of [1440, 390] as const) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript(() =>
      Object.defineProperty(navigator, 'connection', { value: { saveData: true } }),
    );
    const page = await context.newPage();
    await page.goto(base + '/zh-Hans/weather/seoul-1835848');
    await page.locator('.finder').click();
    await page.locator('.place-actions button').last().click();
    await page.locator('.leaflet-container').waitFor();
    rows.push({
      width,
      viewportHeight: 900,
      dialog: await page.locator('dialog:modal').boundingBox(),
      map: await page.locator('.map-view').boundingBox(),
      mapLanguageSelectors: await page.locator('.map-language select').count(),
    });
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  new URL(`./evidence/weather-map-size-${run}.json`, import.meta.url),
  JSON.stringify({ date: new Date().toISOString(), base, rows }, null, 2),
);
console.log(JSON.stringify(rows));
