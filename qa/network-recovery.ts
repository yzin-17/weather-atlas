import { readObject } from './lib/json.ts';
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
  root = 'http://127.0.0.1:3301',
  up = 'http://127.0.0.1:3399',
  report: {
    at: string;
    checks: (
      | '首次无缓存、上游断开时显示失败和重试'
      | '上游恢复后重试显示 24 小时'
      | '3 小时内缓存回退保留真实采集时间与陈旧标记'
      | '后台恢复刷新后移除陈旧标记'
      | '制造 11 秒上游延迟，服务在 10 秒预算后返回可重试 503'
    )[];
    staleFetchedAt?: unknown;
    timeout?: { status: number; ms: number; body: unknown };
  } = { at: new Date().toISOString(), checks: [] };
const control = (q: string) => fetch(up + '/control?' + q),
  store = createSharedStore(new URL('../.cache-verification', import.meta.url).pathname),
  prefix =
    'forecast-v3:' +
    createHash('sha256')
      .update(up + '/forecast')
      .digest('hex')
      .slice(0, 12) +
    ':';
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
    point = '47.1111,22.2222',
    path = '/en/explore?lat=47.1111&lon=22.2222';
  const previous = await store.read(prefix + point);
  if (previous) await store.write(prefix + point, { ...previous, at: Date.now() - 4 * 3600000 });
  await control('failure=503');
  await page.goto(root + path);
  await page.getByText('Forecast unavailable', { exact: true }).waitFor();
  assert.equal(await page.locator('.hour').count(), 0);
  report.checks.push('首次无缓存、上游断开时显示失败和重试');
  await control('reset=1');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.locator('.hour').first().waitFor();
  report.checks.push('上游恢复后重试显示 24 小时');
  const key = prefix + point,
    entry = await store.read(key, cacheRecord(validSnapshot));
  assert(entry);
  await store.write(key, { ...entry, at: Date.now() - 16 * 60000 });
  await control('failure=503');
  await page.reload();
  await page.getByRole('button', { name: 'Cached forecast · Try again', exact: true }).waitFor();
  assert.equal(await page.locator('.hour').count(), 24);
  const after = await store.read(key, cacheRecord(validSnapshot));
  assert.equal(requireValue(after).value.fetchedAt, entry.value.fetchedAt);
  report.staleFetchedAt = entry.value.fetchedAt;
  report.checks.push('3 小时内缓存回退保留真实采集时间与陈旧标记');
  await control('reset=1');
  await store.write('failure:' + key, { at: 0 });
  await page.getByRole('button', { name: 'Cached forecast · Try again', exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Cached forecast · Try again', exact: true }).click();
  await page.waitForTimeout(200);
  assert.equal(
    await page.getByRole('button', { name: 'Cached forecast · Try again', exact: true }).count(),
    0,
  );
  report.checks.push('后台恢复刷新后移除陈旧标记');
  await control('delay=11000');
  const t = performance.now();
  const r = await fetch(root + '/api/weather?lat=48.1234&lon=23.2345');
  report.timeout = { status: r.status, ms: performance.now() - t, body: await readObject(r) };
  assert.equal(r.status, 503);
  assert(report.timeout.ms >= 9500 && report.timeout.ms < 12000);
  report.checks.push('制造 11 秒上游延迟，服务在 10 秒预算后返回可重试 503');
  await page.screenshot({ path: new URL('./evidence/recovery.png', import.meta.url).pathname });
} finally {
  await control('reset=1');
  await browser.close();
  await writeFile(
    new URL('./evidence/network-recovery.json', import.meta.url),
    JSON.stringify(report, null, 2),
  );
}
console.log(JSON.stringify(report));
