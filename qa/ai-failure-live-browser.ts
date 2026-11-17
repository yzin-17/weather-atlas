import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { labels } from '../web/lib/ui-text.ts';
import { isRecord, parseJson } from '../web/lib/validation.ts';

const services = parseJson(
  await readFile(new URL('./evidence/ai-failure-input-services.json', import.meta.url), 'utf8'),
);
assert(isRecord(services) && typeof services.https === 'string');
const browser = await chromium.launch({ headless: true });
const rows: unknown[] = [];
try {
  for (const base of ['http://127.0.0.1:3300', services.https]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      ignoreHTTPSErrors: true,
    });
    try {
      const page = await context.newPage();
      const requests: string[] = [];
      await page.route('**/api/ask', (route) => {
        const body: unknown = route.request().postDataJSON();
        assert(isRecord(body) && typeof body.question === 'string');
        requests.push(body.question);
        return route.fulfill({
          contentType: 'text/event-stream',
          headers: { 'x-vercel-ai-ui-message-stream': 'v1' },
          body: 'data: {"type":"start"}\n\ndata: {"type":"error","errorText":"{\\"status\\":503,\\"code\\":\\"FORECAST_UNAVAILABLE\\"}"}\n\ndata: [DONE]\n\n',
        });
      });
      await page.goto(`${base}/zh-Hans/weather/seoul-1835848`);
      await page.locator('.ask-launcher').click();
      const input = page.locator('#weather-question');
      const question = '今天纽约天气怎样';
      await input.fill(question);
      await page.locator('.ask-submit').click();
      const error = page.getByRole('alert').filter({ hasText: labels('zh-Hans').askForecast });
      await error.waitFor();
      assert.equal(await input.inputValue(), '');
      await error.getByRole('button', { name: labels('zh-Hans').retry, exact: true }).click();
      await error.waitFor();
      await page.waitForFunction(() => !document.querySelector('.ask-working'));
      assert.equal(await input.inputValue(), '');
      if (base.startsWith('https:'))
        await page.screenshot({
          path: new URL('./evidence/ai-failure-input-live.png', import.meta.url).pathname,
        });
      await input.fill(question);
      await error.getByRole('button', { name: labels('zh-Hans').retry, exact: true }).click();
      await error.waitFor();
      await page.waitForFunction(() => !document.querySelector('.ask-working'));
      assert.equal(await input.inputValue(), question);
      assert.equal(await page.locator('.ask-question').count(), 1);
      assert.deepEqual(requests, [question, question, question]);
      rows.push({
        base,
        checks: '失败与重试不回填，保留相同文字新草稿，天气失败提示',
        interceptedRequests: requests.length,
        externalModelCalls: 0,
      });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(
    new URL('./evidence/ai-failure-input-live.json', import.meta.url),
    JSON.stringify({ at: new Date().toISOString(), rows }, null, 2),
  );
}
console.log(JSON.stringify({ services: rows.length, externalModelCalls: 0 }));
