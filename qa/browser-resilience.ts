import { chromium } from 'playwright-core';
import { requireValue } from '../web/lib/validation.ts';
import { cacheRecord } from '../web/lib/validation.ts';
import { validSnapshot } from '../web/lib/client-forecast.ts';
import type { ForecastRecord } from './lib/contracts.ts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createSharedStore } from '../web/lib/shared-store.ts';
import { createHash } from 'node:crypto';

const browser = await chromium.launch({ headless: true }),
  report: {
    at: string;
    checks: (
      | '已授权 GPS 尊重台北城市深链'
      | '迟到自动定位未覆盖手选台北'
      | string
      | '409 刷新两城后保留下午上下文；依据页在手机首屏可见'
    )[];
    askStatuses?: number[];
  } = { at: new Date().toISOString(), checks: [] };
try {
  const context = await browser.newContext({
      permissions: ['geolocation'],
      geolocation: { latitude: 40.7128, longitude: -74.006 },
      viewport: { width: 390, height: 844 },
    }),
    page = await context.newPage();
  await page.goto('http://127.0.0.1:3300/en/weather/taipei-1668341');
  await page.waitForTimeout(500);
  assert(page.url().includes('taipei-'));
  report.checks.push('已授权 GPS 尊重台北城市深链');
  await context.close();
  const race = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' }),
    p = await race.newPage();
  await p.addInitScript(() => {
    navigator.permissions.query = async () =>
      Object.assign(new EventTarget(), {
        state: 'granted' as const,
        name: 'geolocation' as const,
        onchange: null,
      });
    navigator.geolocation.getCurrentPosition = (success) => {
      window.__lateGPS = success;
    };
  });
  await p.goto('http://127.0.0.1:3300/zh-Hans');
  await p.waitForFunction(() => !!window.__lateGPS);
  await p.getByRole('button', { name: '搜索地点', exact: true }).click();
  await p.getByPlaceholder('搜索全球城市或城镇').fill('台北');
  await p.locator('.places button').first().click();
  await p.waitForURL('**/weather/taipei-1668341');
  await p.evaluate(() =>
    window.__lateGPS({
      coords: {
        latitude: 40.7128,
        longitude: -74.006,
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
  await p.waitForTimeout(400);
  assert(p.url().includes('taipei-'));
  report.checks.push('迟到自动定位未覆盖手选台北');
  await race.close();
  for (const code of [1, 3] as const) {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } }),
      q = await c.newPage();
    await q.addInitScript((code) => {
      navigator.geolocation.getCurrentPosition = (_success, fail) =>
        fail?.({
          code,
          message: 'controlled geolocation error',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
    }, code);
    await q.goto('http://127.0.0.1:3300/zh-Hans/weather/seoul-1835848');
    await q.getByRole('button', { name: '搜索地点', exact: true }).click();
    await q.getByRole('button', { name: '使用我的位置', exact: true }).click();
    await q.getByPlaceholder('搜索全球城市或城镇').fill('台北');
    await q.locator('.places button').first().click();
    await q.waitForURL('**/weather/taipei-1668341');
    report.checks.push(`定位错误 ${code} 后手选成功`);
    await c.close();
  }
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    q = await c.newPage(),
    status: number[] = [];
  q.on('response', (r) => {
    if (r.url().endsWith('/api/ask')) status.push(r.status());
  });
  await q.goto('http://127.0.0.1:3301/zh-Hans/weather/seoul-1835848');
  await q.locator('.ask-launcher').click();
  await q.locator('.prompts button').last().click();
  await q.locator('.answer').first().waitFor();
  const store = createSharedStore(new URL('../.cache-verification', import.meta.url).pathname),
    prefix =
      'forecast-v3:' +
      createHash('sha256').update('http://127.0.0.1:3399/forecast').digest('hex').slice(0, 12) +
      ':';
  for (const coords of ['37.577,126.98', '25.0478,121.5319'] as const) {
    const key = prefix + coords,
      entry = await store.read(key, cacheRecord(validSnapshot));
    assert(entry);
    await store.write(key, {
      ...entry,
      at: Date.now(),
      value: { ...entry.value, version: entry.value.version + '-qa' },
    });
  }
  await q.getByRole('button', { name: '那下午呢？', exact: true }).click();
  await q.getByRole('button', { name: '刷新预报并重试', exact: true }).click();
  await q.locator('.answer').first().waitFor();
  assert.deepEqual(status, [200, 409, 200]);
  await q.locator('.evidence button').filter({ hasText: '台北' }).first().click();
  const preview = q.getByTestId('comparison-forecast');
  await preview.waitFor();
  assert((await preview.innerText()).includes('Asia/Taipei'));
  assert(await preview.isVisible());
  const box = await preview.boundingBox();
  assert(requireValue(box).y >= 0 && requireValue(box).y < 844);
  await q.screenshot({
    path: new URL('./evidence/comparison-refreshed.png', import.meta.url).pathname,
  });
  report.checks.push('409 刷新两城后保留下午上下文；依据页在手机首屏可见');
  report.askStatuses = status;
  await c.close();
} finally {
  await browser.close();
  await writeFile(
    new URL('./evidence/browser-resilience.json', import.meta.url),
    JSON.stringify(report, null, 2),
  );
}
console.log(JSON.stringify(report));
