import { chromium } from 'playwright-core';
import { requireValue } from '../web/lib/validation.ts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true }),
  origin = process.env.APP_URL || 'http://localhost:3304',
  rows: { width: number; locale: string; selectWidth: number; searchWidth: number }[] = [];
try {
  for (const width of [1440, 1024, 768, 390, 320] as const) {
    const context = await browser.newContext({ viewport: { width, height: 900 } }),
      page = await context.newPage(),
      values: number[] = [];
    await page.goto(origin + '/zh-Hans/weather/seoul-1835848', { waitUntil: 'domcontentloaded' });
    for (const locale of ['zh-Hans', 'zh-Hant', 'en', 'ko'] as const) {
      await page.locator('#locale-select').selectOption(locale);
      await page.waitForURL(`**/${locale}/weather/seoul-1835848`);
      const box = await page.locator('#locale-select').boundingBox(),
        finder = await page.locator('.finder').boundingBox();
      values.push(requireValue(box).width);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      rows.push({
        width,
        locale,
        selectWidth: requireValue(box).width,
        searchWidth: requireValue(finder).width,
      });
      if (width === 1440 && ['zh-Hans', 'en'].includes(locale)) {
        await page.screenshot({
          path: new URL(`./evidence/language-toolbar-${locale}.png`, import.meta.url).pathname,
          clip: { x: 860, y: 0, width: 580, height: 90 },
        });
      }
    }
    assert(Math.max(...values) - Math.min(...values) < 1);
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(
    new URL('./evidence/language-control.json', import.meta.url),
    JSON.stringify({ at: new Date().toISOString(), rows }, null, 2),
  );
}
console.log(
  JSON.stringify({
    views: rows.length,
    widths: [...new Set(rows.map((r) => r.selectWidth))],
    passed: true,
  }),
);
