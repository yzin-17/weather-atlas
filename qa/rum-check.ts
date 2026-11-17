import { chromium } from 'playwright-core';
import { validMetricRows } from '../web/lib/rum.ts';
import type { MetricRow } from '../web/lib/rum.ts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createSharedStore } from '../web/lib/shared-store.ts';
import { summarizeMetrics } from '../web/lib/rum.ts';

const browser = await chromium.launch({ headless: true }),
  responses: number[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('response', (r) => {
    if (r.url().endsWith('/api/vitals')) responses.push(r.status());
  });
  await page.goto('http://127.0.0.1:3300/zh-Hans/weather/seoul-1835848', {
    waitUntil: 'networkidle',
  });
  await page.getByRole('button', { name: '搜索地点', exact: true }).click();
  await page.getByPlaceholder('搜索全球城市或城镇').fill('台北');
  await page.waitForTimeout(500);
  await page.locator('.dialog-heading button').click();
  await page.waitForTimeout(1000);
  await page.goto('about:blank');
  await page.waitForTimeout(700);
  assert(responses.includes(204), JSON.stringify(responses));
} finally {
  await browser.close();
}
const store = createSharedStore(new URL('../.weather-cache', import.meta.url).pathname),
  rows = (await store.read('rum:' + new Date().toISOString().slice(0, 10), validMetricRows)) || [];
assert(['LCP', 'INP', 'CLS'].every((name) => rows.some((r: { name: string }) => r.name === name)));
assert(
  rows.every((r) => !('url' in r) && !('question' in r) && !('latitude' in r) && !('ip' in r)),
);
const report: {
  at: string;
  dataset: 'local-validation';
  source: '浏览器 web-vitals 与 sendBeacon 真实链路；受控访问';
  responses: number[];
  samples: unknown;
  groups: { group: string; count: number; p75: number; from: string; to: string }[];
} = {
  at: new Date().toISOString(),
  dataset: 'local-validation',
  source: '浏览器 web-vitals 与 sendBeacon 真实链路；受控访问',
  responses,
  samples: rows.length,
  groups: summarizeMetrics(rows),
};
await writeFile(
  new URL('./evidence/rum-controlled.json', import.meta.url),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
