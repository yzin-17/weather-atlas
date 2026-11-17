import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { locales } from '../web/lib/catalog.ts';
import { labels } from '../web/lib/ui-text.ts';

const base = process.env.APP_URL || 'http://127.0.0.1:3332';
const browser = await chromium.launch({ headless: true });
const rows: { width: number; locale: string; mapEntry: string; weatherRequests: number }[] = [];
const errors: string[] = [];
try {
  for (const width of [1440, 1024, 768, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      // 本轮验证入口与布局；底图网络不参与通过条件，产品仍使用真实 OSM。
      await context.route('**/api/map-tiles/**', (route) => route.abort());
      const page = await context.newPage();
      const requests: string[] = [];
      page.on('request', (r) => requests.push(r.url()));
      page.on('pageerror', (e) => errors.push(e.message));
      for (const locale of locales) {
        const start = requests.length;
        await page.goto(`${base}/${locale}/weather/seoul-1835848`);
        await page.locator('.hour').first().waitFor();
        assert.equal(
          await page.locator('aside .map-entry, aside button:has(svg.icon-map)').count(),
          0,
        );
        await page.locator('aside .provider').waitFor();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        assert.equal(requests.slice(start).filter((u) => u.includes('/api/map-tiles/')).length, 0);
        if (locale === 'zh-Hans') {
          await page.screenshot({
            path: new URL(`./evidence/map-entry-cleanup-${width}.png`, import.meta.url).pathname,
            fullPage: true,
          });
        }
        await page.locator('.finder').click();
        const mapButton = page
          .locator('.place-actions')
          .getByRole('button', { name: labels(locale).map, exact: true });
        await mapButton.focus();
        const before = requests.length;
        await page.keyboard.press('Enter');
        await page.locator('.leaflet-control-zoom-in').waitFor();
        assert.equal(await page.locator('.map-dialog select').count(), 0);
        const weatherRequests = requests
          .slice(before)
          .filter((u) => /\/api\/(weather|summaries)\?/.test(u)).length;
        assert.equal(weatherRequests, 0);
        await page.getByRole('button', { name: labels(locale).close, exact: true }).click();
        assert.equal(await page.locator('.map-dialog').count(), 0);
        rows.push({
          width,
          locale,
          mapEntry: '顶部搜索 → 地图；键盘 Enter 可打开',
          weatherRequests,
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
    new URL('./evidence/map-entry-browser.json', import.meta.url),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        scope: '入口与布局，瓦片请求受控中止，不代表底图可用性验收',
        rows,
        errors,
      },
      null,
      2,
    ),
  );
}
