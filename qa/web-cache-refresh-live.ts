import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, type APIResponse } from 'playwright-core';
import { catalog, locales } from '../web/lib/catalog.ts';
import { decode, isRecord, parseJson } from '../web/lib/validation.ts';
import { validSnapshot } from '../web/lib/client-forecast.ts';

// 对已更新日常服务做真实天气／换语言检查，不调用问答。
const services = parseJson(
  await readFile(new URL('./evidence/web-cache-refresh-services.json', import.meta.url), 'utf8'),
);
assert(isRecord(services) && typeof services.https === 'string');
const city = catalog.find((city) => city.id === 1835848);
assert(city);
const browser = await chromium.launch({ headless: true });
const rows: Record<string, unknown>[] = [];
const errors: string[] = [];
try {
  // headless Chromium 的本地证书信任单列；另用本地根 CA 验证 TLS。
  for (const base of ['http://127.0.0.1:3300', services.https]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      ignoreHTTPSErrors: true,
    });
    try {
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'connection', { value: { saveData: true } });
      });
      const response: APIResponse = await context.request.get(
        `${base}/api/weather?lat=${city.lat}&lon=${city.lon}&fresh=1`,
      );
      assert(response.ok());
      const forecast = decode(parseJson(await response.text()), validSnapshot);
      assert.equal(forecast.source, 'open-meteo');
      assert.equal(forecast.stale, false);
      const page = await context.newPage();
      const requests: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('request', (r) => {
        if (new URL(r.url()).pathname === '/api/weather') requests.push(r.url());
        assert.notEqual(new URL(r.url()).pathname, '/api/ask');
      });
      await page.goto(`${base}/en/weather/${city.slug}`);
      for (const locale of locales) {
        await page.locator('#locale-select').selectOption(locale);
        await page.waitForURL(`**/${locale}/weather/${city.slug}`);
        await page.locator('html[lang="' + locale + '"]').waitFor();
        assert.equal(await page.locator('.hour').count(), 24);
        assert.equal(await page.getByTestId('forecast-refresh').count(), 0);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        rows.push({
          base,
          locale,
          timezone: forecast.timezone,
          stale: forecast.stale,
          weatherRequests: requests.length,
        });
      }
      assert.equal(requests.length, 0, '切语言复用有效预报');
      if (base.startsWith('https:'))
        await page.screenshot({
          path: new URL('./evidence/web-cache-refresh-live.png', import.meta.url).pathname,
        });
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await writeFile(
    new URL('./evidence/web-cache-refresh-live.json', import.meta.url),
    JSON.stringify({ at: new Date().toISOString(), checks: rows.length, rows, errors }, null, 2),
  );
}
console.log(JSON.stringify({ checks: rows.length, errors }));
