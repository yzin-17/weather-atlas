import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true }),
  rows: (
    | { phase: string; kind: string; url: string }
    | { phase: string; kind: string; url: string; 说明: string }
  )[] = [],
  pending: Promise<void>[] = [];
let phase = 'home';
let passed = false;
const counts = () =>
  Object.fromEntries(
    ['home', 'open'].map((p) => [
      p,
      Object.fromEntries(
        ['script', 'stylesheet', 'tile'].map((k) => [
          k,
          rows.filter((r) => r.phase === p && r.kind === k).length,
        ]),
      ),
    ]),
  );
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('response', (r) => {
    const stage = phase,
      url = r.url(),
      type = r.request().resourceType();
    if (/\/api\/map-tiles\/|tile.openstreetmap.org|api.maptiler.com/.test(url))
      rows.push({ phase: stage, kind: 'tile', url });
    if (['script', 'stylesheet'].includes(type))
      pending.push(
        (async () => {
          const body = await r.text();
          if (
            body.includes('leaflet-container') ||
            body.includes('leaflet-pane') ||
            body.includes('tile.openstreetmap.org')
          )
            rows.push({
              phase: stage,
              kind: type,
              url,
              说明:
                type === 'stylesheet'
                  ? '包含地图规则的样式表，可同时包含页面通用规则'
                  : '地图组件或 Leaflet 脚本',
            });
        })(),
      );
  });
  await page.goto('http://127.0.0.1:3300/zh-Hans/weather/seoul-1835848', {
    waitUntil: 'networkidle',
  });
  await Promise.all(pending);
  phase = 'open';
  await page.getByRole('button', { name: '地图选点', exact: true }).click();
  await page.locator('.leaflet-container').waitFor();
  await page.waitForLoadState('networkidle');
  await Promise.all(pending);
  const summary = counts();
  assert.equal(summary.home.tile, 0);
  assert.equal(summary.home.script, 0);
  assert(summary.open.script > 0);
  assert(summary.open.tile > 0);
  passed = true;
  console.log(JSON.stringify(summary));
} finally {
  await writeFile(
    new URL('./evidence/map-resources.json', import.meta.url),
    JSON.stringify({ at: new Date().toISOString(), passed, counts: counts(), rows }, null, 2),
  );
  await browser.close();
}
