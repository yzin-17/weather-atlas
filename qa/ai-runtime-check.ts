import { readAnswer, readForecast } from './lib/json.ts';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

// 显式执行本脚本会向所选服务提问；model 模式会调用其真实模型。
const base = process.env.APP_URL || 'http://127.0.0.1:3300';
const expected = process.env.QA_AI_EXPECT || 'model';
const run = process.env.QA_AI_RUN || 'ai-restoration';
assert(['model', 'rules'].includes(expected) && /^[a-z0-9-]+$/.test(run));
const started = performance.now();
const requests: number[] = [];
let source: 'rules' | 'model', badge: string | undefined;
if (process.env.QA_AI_UI === '1') {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' });
    await page.goto(base + '/zh-Hans/weather/seoul-1835848');
    await page.locator('.hour').first().waitFor();
    await page.locator('.ask-launcher').click();
    const responsePromise = page.waitForResponse(
      (r) => r.url().endsWith('/api/ask') && r.request().method() === 'POST',
    );
    await page.locator('.prompts button').first().click();
    let response = await responsePromise;
    requests.push(response.status());
    if (response.status() === 409) {
      const retry = page.waitForResponse(
        (r) => r.url().endsWith('/api/ask') && r.request().method() === 'POST',
      );
      await page.getByRole('button', { name: '刷新预报并重试', exact: true }).click();
      response = await retry;
      requests.push(response.status());
    }
    const value = await readAnswer(response);
    assert.equal(response.status(), 200, 'AI 请求失败');
    source = value.source;
    assert.equal(source, expected);
    await page.locator('.answer .list-caption').waitFor();
    badge = await page.locator('.answer .list-caption').innerText();
    assert.equal(badge, expected === 'model' ? 'AI 解读' : '本地规则解读');
    assert((await page.locator('.evidence button').count()) > 0);
    await page.screenshot({
      path: new URL(`./evidence/${run}.png`, import.meta.url).pathname,
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
} else {
  let weather = await fetch(base + '/api/weather?lat=37.566&lon=126.9784').then((r) =>
    readForecast(r),
  );
  const ask = () =>
    fetch(base + '/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question: '未来6小时需要带伞吗？',
        locale: 'zh-Hans',
        lat: 37.566,
        lon: 126.9784,
        version: weather.version,
      }),
    });
  let response = await ask();
  requests.push(response.status);
  if (response.status === 409) {
    weather = await fetch(base + '/api/weather?lat=37.566&lon=126.9784').then((r) =>
      readForecast(r),
    );
    response = await ask();
    requests.push(response.status);
  }
  const value = await readAnswer(response);
  assert.equal(response.status, 200, 'AI 请求失败');
  source = value.source;
  assert.equal(source, expected);
  assert(value.evidence?.length > 0);
}
const report: {
  at: string;
  base: string;
  expected: string;
  source: string;
  badge: string | undefined;
  statuses: number[];
  ms: number;
} = {
  at: new Date().toISOString(),
  base,
  expected,
  source,
  badge,
  statuses: requests,
  ms: Math.round(performance.now() - started),
};
await writeFile(
  new URL(`./evidence/${run}.json`, import.meta.url),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
