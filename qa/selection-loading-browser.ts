import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { locales } from '../web/lib/catalog.ts';
import { labels } from '../web/lib/ui-text.ts';

const base = process.env.APP_URL || 'http://127.0.0.1:3332';
const browser = await chromium.launch({ headless: true });
const rows: object[] = [],
  errors: string[] = [];
let sequence = 0;
try {
  for (const width of [1440, 1024, 768, 390])
    for (const locale of locales) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      let release = () => {};
      try {
        await context.addInitScript(() =>
          Object.defineProperty(navigator, 'connection', { value: { saveData: true } }),
        );
        await context.route('**/api/map-tiles/**', (r) => r.abort());
        await context.route('**/api/reverse?**', (r) =>
          r.fulfill({ json: { place: null, attribution: null } }),
        );
        const page = await context.newPage();
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(`${base}/${locale}/weather/seoul-1835848`);
        await page.locator('.hour').first().waitFor();
        await page.locator('.finder').click();
        await page.locator('.place-actions button').last().click();
        const lat = (23 + ++sequence / 100).toFixed(2),
          lon = '114.41';
        const fields = page.locator('.coordinate-entry input');
        await fields.nth(0).fill(lat);
        await fields.nth(1).fill(lon);
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        let seen = false;
        await context.route('**/explore?**', async (route) => {
          seen = true;
          await gate;
          await route.continue();
        });
        await page.locator('.map-selection .primary').click();
        const loading = page.locator('.weather-loading');
        await loading.waitFor();
        assert((await loading.innerText()).includes(labels(locale).loadingWeather));
        assert((await loading.innerText()).includes(lat));
        assert.equal(
          await page
            .locator('.current-panel:visible, .hours:visible, .ask-launcher:visible')
            .count(),
          0,
        );
        await page.waitForTimeout(500);
        assert(await loading.isVisible());
        assert(seen);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        if (locale === 'zh-Hans')
          await page.screenshot({
            path: new URL(`./evidence/selection-loading-${width}.png`, import.meta.url).pathname,
          });
        release();
        await page.waitForURL(`**/${locale}/explore?**`);
        await page.locator('.hour').first().waitFor();
        assert.equal(await loading.count(), 0);
        assert.equal(Number(new URL(page.url()).searchParams.get('lat')), Number(lat));
        assert.match(await page.locator('.temperature').innerText(), /8/);
        rows.push({
          locale,
          width,
          coordinates: [lat, lon],
          pending: '500ms 保持加载占位、隐藏旧天气与旧 AI',
          completed: true,
        });
      } finally {
        release();
        await context.close();
      }
    }
  // 加载中仍允许手动选择别处，旧坐标响应不能覆盖较新的选择。
  {
    const context = await browser.newContext();
    let release = () => {};
    try {
      const page = await context.newPage();
      await context.route('**/api/map-tiles/**', (r) => r.abort());
      await context.route('**/api/reverse?**', (r) =>
        r.fulfill({ json: { place: null, attribution: null } }),
      );
      await page.goto(`${base}/en/weather/seoul-1835848`);
      await page.locator('.finder').click();
      await page.locator('.place-actions button').last().click();
      const fields = page.locator('.coordinate-entry input');
      await fields.nth(0).fill('22.55');
      await fields.nth(1).fill('114.55');
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await context.route('**/explore?**', async (r) => {
        await gate;
        await r.continue();
      });
      await page.locator('.map-selection .primary').click();
      await page.locator('.weather-loading').waitFor();
      await context.route('**/api/places?**', (r) =>
        r.fulfill({
          json: {
            places: [{ id: 1850147, name: 'Tokyo', country: 'Japan', lat: 35.6895, lon: 139.6917 }],
          },
        }),
      );
      await page.locator('.finder').click();
      await page.locator('.search-input input').fill('Tokyo');
      await page.getByRole('option').filter({ hasText: 'Tokyo' }).click();
      await page.waitForURL('**/en/weather/tokyo-1850147');
      await page.locator('.hour').first().waitFor();
      release();
      await page.waitForTimeout(250);
      assert(new URL(page.url()).pathname.endsWith('/tokyo-1850147'));
      assert.equal(await page.locator('.weather-loading').count(), 0);
      assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'Tokyo');
      rows.push({ scenario: '加载期间重新选城', retained: 'Tokyo', latePointIgnored: true });
    } finally {
      release();
      await context.close();
    }
  }
  // 上游失败时占位结束，显示当前点的失败与重试，而非旧城市数据。
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await context.route('**/api/map-tiles/**', (r) => r.abort());
    await context.route('**/api/reverse?**', (r) =>
      r.fulfill({ json: { place: null, attribution: null } }),
    );
    await page.goto(`${base}/en/weather/seoul-1835848`);
    await page.locator('.finder').click();
    await page.locator('.place-actions button').last().click();
    const fields = page.locator('.coordinate-entry input');
    await fields.nth(0).fill('22.77');
    await fields.nth(1).fill('114.22');
    await fetch('http://127.0.0.1:3333/control?failure=503');
    await page.locator('.map-selection .primary').click();
    await page.waitForURL('**/en/explore?**');
    await page.locator('.unavailable').waitFor();
    assert.equal(await page.locator('.weather-loading').count(), 0);
    assert.equal(await page.locator('.current-panel').count(), 0);
    assert(await page.locator('.unavailable button').isEnabled());
    rows.push({
      scenario: '上游失败',
      loadingEnded: true,
      retryVisible: true,
      oldWeatherVisible: false,
    });
  } finally {
    await fetch('http://127.0.0.1:3333/control?failure=0');
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks: rows.length, errors }));
} finally {
  await browser.close();
  await writeFile(
    new URL('./evidence/selection-loading-browser.json', import.meta.url),
    JSON.stringify(
      {
        time: new Date().toISOString(),
        rows,
        errors,
        mode: '受控 RSC 延迟与天气上游；未调用模型；本项不验证底图',
      },
      null,
      2,
    ),
  );
}
