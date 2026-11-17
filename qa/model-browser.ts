import { readComparison } from './lib/json.ts';
import { errorInfo } from '../web/lib/errors.ts';
import { chromium } from 'playwright-core';
import { requireValue } from '../web/lib/validation.ts';
import type { ComparisonAnswer } from './lib/contracts.ts';
import type { ComparisonRow } from '../web/lib/types.ts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const base = process.env.APP_URL || 'http://127.0.0.1:3305',
  name = process.env.MODEL_BROWSER_RUN || 'model-browser';
assert(/^[a-z0-9-]+$/.test(name));
const browser = await chromium.launch({ headless: true }),
  rows: {
    status: number;
    source: unknown;
    model: unknown;
    modelMs: unknown;
    plan: unknown;
    comparisons: ComparisonRow[];
  }[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  async function answer(action: () => Promise<unknown>, index: number) {
    let response = page.waitForResponse((r: { url: () => string }) => r.url().endsWith('/api/ask'));
    await action();
    let r = await response,
      b: ComparisonAnswer;
    try {
      b = await readComparison(r);
    } catch (error) {
      if (r.status() !== 409 && !/"status"\s*:\s*409/.test(errorInfo(error).message)) throw error;
      response = page.waitForResponse((r: { url: () => string }) => r.url().endsWith('/api/ask'));
      await page.getByRole('button', { name: /刷新.*预报/ }).click();
      r = await response;
      b = await readComparison(r);
    }
    rows.push({
      status: r.status(),
      source: b.source,
      model: b.model,
      modelMs: b.modelMs,
      plan: b.context?.plan,
      comparisons: b.comparisons,
    });
    assert.equal(r.status(), 200);
    assert.equal(b.source, 'model');
    assert.equal(b.comparisons.length, 2);
    assert(
      b.comparisons.every(
        (c) =>
          c.complete && Number.isFinite(c.value) && requireValue(c.forecast).version === c.version,
      ),
    );
    if (process.env.EXPECT_OPEN_METEO === '1')
      assert(b.comparisons.every((c) => requireValue(c.forecast).source === 'open-meteo'));
    assert.equal(b.context.plan.fromHour, index ? 12 : 7);
    assert.equal(b.context.plan.toHour, index ? 17 : 9);
    assert.equal(b.context.plan.intent, index === 2 ? 'temperature' : 'rain');
    await page.locator('.ask-conversation .answer').last().waitFor();
    assert(
      !(await page.locator('.ask-conversation .answer').last().innerText()).includes('无法比较'),
    );
  }
  await page.goto(base + '/zh-Hans/weather/seoul-1835848');
  await page.locator('.ask-launcher').click();
  await answer(() => page.locator('.prompts button').last().click(), 0);
  for (const [i, label] of ['那下午呢？', '哪个更冷？'].entries())
    await answer(async () => {
      await page.locator('#weather-question').fill(label);
      await page.locator('.ask-submit').click();
    }, i + 1);
  assert(
    (await page.locator('.ask-conversation .answer').last().innerText()).includes('12:00–17:00'),
  );
  await page
    .locator('.ask-conversation .answer')
    .last()
    .locator('.evidence button')
    .filter({ hasText: '台北' })
    .first()
    .click();
  assert((await page.getByTestId('comparison-forecast').innerText()).includes('Asia/Taipei'));
  await page.screenshot({ path: new URL(`./evidence/${name}.png`, import.meta.url).pathname });
  assert.equal(rows.filter((r) => r.status === 200).length, 3);
} finally {
  await browser.close();
  await writeFile(
    new URL(`./evidence/${name}.json`, import.meta.url),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        weather: process.env.EXPECT_OPEN_METEO === '1' ? 'open-meteo' : 'controlled fixture',
        rows,
      },
      null,
      2,
    ),
  );
}
console.log(
  JSON.stringify(
    rows.map(({ status, source, model, modelMs, plan, comparisons }) => ({
      status,
      source,
      model,
      modelMs,
      plan,
      cities: comparisons?.map((c) => ({
        name: c.city.name,
        date: c.date,
        value: c.value,
        version: c.version,
      })),
    })),
  ),
);
