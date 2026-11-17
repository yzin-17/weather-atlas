import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { validPlaceLabel } from '../web/lib/contracts.ts';
import { isRecord } from '../web/lib/validation.ts';

const base = process.env.APP_URL || 'http://localhost:3300';
const run = process.env.QA_REVERSE_RUN || 'reverse-recovery-live-browser';
assert(/^[a-z0-9-]+$/.test(run));
const browser = await chromium.launch({ headless: true });
const errors: string[] = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const started = performance.now();
  const response = await context.request.get(
    `${base}/api/reverse?lat=30.7513&lon=106.2048&lang=zh-Hans`,
  );
  const raw: unknown = await response.json();
  assert.equal(response.status(), 200);
  assert(isRecord(raw) && validPlaceLabel(raw.place));
  assert.equal(raw.place.name, '高坪区');
  assert.equal(raw.place.level, 'region');
  const apiMs = Math.round(performance.now() - started);
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/zh-Hans/explore?lat=30.7513&lon=106.2048&kind=pin&id=point`, {
    timeout: 40000,
  });
  await page.getByRole('heading', { level: 1, name: '高坪区', exact: true }).waitFor();
  await page.locator('.hour').first().waitFor();
  assert.equal(await page.locator('.hour').count(), 24);
  assert.equal(new URL(page.url()).searchParams.get('lat'), '30.7513');
  assert.equal(new URL(page.url()).searchParams.get('lon'), '106.2048');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: new URL(`./evidence/${run}.png`, import.meta.url).pathname });
  assert.deepEqual(errors, []);
  const result = {
    at: new Date().toISOString(),
    base,
    apiMs,
    place: raw.place,
    heading: await page.locator('h1').innerText(),
    hours: 24,
    exactCoordinatesPreserved: true,
    errors,
    realModelCalls: 0,
  };
  await writeFile(
    new URL(`./evidence/${run}.json`, import.meta.url),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
