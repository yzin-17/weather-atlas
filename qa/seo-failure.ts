import { readStats } from './lib/json.ts';
import { chromium } from 'playwright-core';
import { requireValue } from '../web/lib/validation.ts';
import { cacheRecord } from '../web/lib/validation.ts';
import { validSnapshot } from '../web/lib/client-forecast.ts';
import type { ForecastRecord } from './lib/contracts.ts';
import { errorInfo } from '../web/lib/errors.ts';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createSharedStore } from '../web/lib/shared-store.ts';

const base = process.env.APP_URL || 'http://127.0.0.1:3322';
const upstream = process.env.QA_FIXTURE_URL || 'http://127.0.0.1:3320';
const directory = process.env.QA_FAILURE_CACHE;
assert(
  directory &&
    path.isAbsolute(directory) &&
    path.basename(directory).startsWith('.cache-seo-audit-'),
  '只能修改本专项新建的隔离缓存',
);
assert.equal(new URL(upstream).hostname, '127.0.0.1');
const store = createSharedStore(directory);
const prefix =
  'forecast-v3:' +
  createHash('sha256')
    .update(upstream + '/forecast')
    .digest('hex')
    .slice(0, 12) +
  ':';
const key = prefix + '37.566,126.9784';
assert.equal(
  await store.read(key, cacheRecord(validSnapshot)),
  null,
  '必须使用新的隔离缓存，保留既有失败样本',
);
const control = (q: string) => fetch(upstream + '/control?' + q);
const stats = () => fetch(upstream + '/stats').then((r) => readStats(r));
const report: {
  at: string;
  base: string;
  checks: (
    | { scenario: string; status: number; index: boolean; forecast: boolean; calls: number }
    | { scenario: string; index: true }
    | { scenario: string; index: true; fetchedAt: unknown }
    | { scenario: string; passed: true }
  )[];
  errors: string[];
} = { at: new Date().toISOString(), base, checks: [], errors: [] };
async function city(expected: boolean, scenario: string) {
  const res = await fetch(base + '/en/weather/seoul-1835848'),
    html = await res.text();
  const head = html.split('</head>')[0];
  assert.equal(res.status, 200);
  assert.equal(/name="robots" content="noindex, follow"/.test(head), !expected);
  assert.equal(html.includes('class="hour'), expected);
  const calls = (await stats()).calls.forecast;
  assert.equal(calls, 1, 'metadata 与正文在成功／失败时均只读一次上游');
  report.checks.push({ scenario, status: res.status, index: expected, forecast: expected, calls });
  return html;
}
try {
  await control('failure=503&reset=1');
  await city(false, '首次上游失败，城市无缓存时 noindex');
  const home = await fetch(base + '/en').then((r) => r.text());
  assert(
    home.includes('id="home-title"') &&
      /name="robots" content="index, follow"/.test(home.split('</head>')[0]),
  );
  report.checks.push({ scenario: '稳定首页介绍在天气失败时仍可索引', index: true });
  await control('reset=1');
  await city(true, '上游恢复后原始城市 HTML 自动恢复 index');
  const fresh = await store.read(key, cacheRecord(validSnapshot));
  assert(fresh?.value?.fetchedAt);
  await store.write(key, { ...fresh, at: Date.now() - 16 * 60000 });
  await store.write('failure:' + key, { at: 0 });
  await control('failure=503&reset=1');
  const stale = await fetch(base + '/en/weather/seoul-1835848').then((r) => r.text());
  assert(
    /name="robots" content="index, follow"/.test(stale.split('</head>')[0]) &&
      stale.includes('class="hour'),
  );
  for (let n = 0; n < 30 && !(await stats()).calls.forecast; n++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal((await stats()).calls.forecast, 1);
  assert.equal(
    requireValue(await store.read(key, cacheRecord(validSnapshot))).value.fetchedAt,
    fresh.value.fetchedAt,
  );
  report.checks.push({
    scenario: '三小时内旧预报仍可索引且保留采集时间，后台失败仅一次',
    index: true,
    fetchedAt: fresh.value.fetchedAt,
  });
  await store.write(key, { ...fresh, at: Date.now() - 4 * 3600000 });
  await store.write('failure:' + key, { at: 0 });
  await control('failure=503&reset=1');
  await city(false, '超出三小时旧数据上限时不冒充可用预报');

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
    page.on('pageerror', (e) => report.errors.push(errorInfo(e).message));
    await page.goto(base + '/en/weather/tokyo-1850147');
    await page.getByText('Forecast unavailable', { exact: true }).waitFor();
    assert(
      requireValue(await page.locator('meta[name=robots]').getAttribute('content')).includes(
        'noindex',
      ),
    );
    assert(await page.locator('.finder').isVisible());
    await control('reset=1');
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.locator('.hour').first().waitFor();
    assert.equal(await page.locator('.hour').count(), 24);
    await page.reload();
    assert.equal(await page.locator('meta[name=robots]').getAttribute('content'), 'index, follow');
    report.checks.push({
      scenario: '实际浏览器故障页保留搜索和重试；重试与重载恢复预报和索引',
      passed: true,
    });
    assert.deepEqual(report.errors, []);
  } finally {
    await browser.close();
  }
} finally {
  await control('reset=1');
  await writeFile(
    new URL('./evidence/seo-failure-after.json', import.meta.url),
    JSON.stringify(report, null, 2),
  );
}
console.log('首次失败／恢复／旧快照／过期／实际点击重试通过，metadata 与正文无重复上游');
