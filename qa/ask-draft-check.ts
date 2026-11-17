import { validateInput } from '../web/lib/ask.ts';
import { validComparisonContext } from '../web/lib/contracts.ts';
import { isRecord } from '../web/lib/validation.ts';
import { chromium } from 'playwright-core';
import { requireValue } from '../web/lib/validation.ts';
import type { AskInput } from '../web/lib/types.ts';
type PendingAsk = {
  body: AskInput & { context?: { plan: { fromHour: number; toHour: number } } };
  finish: (status: number, data: unknown) => Promise<void>;
};
import { errorInfo } from '../web/lib/errors.ts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { labels } from '../web/lib/ui-text.ts';
import { askSse } from './lib/ask-sse.ts';

const base = process.env.APP_URL || 'http://127.0.0.1:3318';
const browser = await chromium.launch({ headless: true });
const rows: { width: number; scenario: string; passed: boolean }[] = [],
  errors: string[] = [],
  t = labels('zh-Hans');
try {
  for (const width of [1440, 390] as const) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, locale: 'zh-CN' });
    const pending: PendingAsk[] = [],
      bodies: unknown[] = [];
    page.on('pageerror', (error) => errors.push(errorInfo(error).message));
    await page.route(
      '**/api/ask',
      (route) =>
        new Promise<void>((resolve) => {
          const raw: unknown = route.request().postDataJSON();
          const body = {
            ...validateInput(raw),
            ...(isRecord(raw) && validComparisonContext(raw.context)
              ? { context: raw.context }
              : {}),
          };
          bodies.push(body);
          pending.push({
            body,
            finish: async (status: number, data) => {
              if (status === 0) await route.abort('failed');
              else if (status === 200) await route.fulfill({ status, ...askSse(data) });
              else
                await route.fulfill({
                  status,
                  contentType: 'application/json',
                  body: JSON.stringify(data),
                });
              resolve();
            },
          });
        }),
    );
    await page.goto(base + '/zh-Hans/weather/seoul-1835848');
    await page.locator('.hour').first().waitFor();
    await page.locator('.ask-launcher').click();
    const input = page.locator('#weather-question');
    const next = async () => {
      for (let n = 0; n < 100 && !pending.length; n++)
        await new Promise((resolve) => setTimeout(resolve, 20));
      assert(pending.length, '没有发出问答请求');
      return requireValue(pending.shift());
    };
    const send = async (question: string, enter = false) => {
      await input.fill(question);
      if (enter) await input.press('Enter');
      else await page.locator('.ask-submit').click();
      const entry = await next();
      assert.equal(await input.inputValue(), '', '请求未返回前就应清空输入');
      assert.equal(await page.locator('.ask-question').last().innerText(), question.trim());
      return entry;
    };
    const finish = async (entry: PendingAsk, status = 200, context: unknown = undefined) => {
      await entry.finish(
        status,
        status === 200
          ? {
              answer: '受控预报回答',
              source: 'model',
              version: entry.body.version,
              evidence: [],
              context,
            }
          : { code: status === 409 ? 'STALE_FORECAST' : 'MODEL_UNAVAILABLE' },
      );
      await page.waitForFunction(() => !document.querySelector('.ask-working'));
    };
    const record = (scenario: string) => rows.push({ width, scenario, passed: true });
    await page.locator('.prompts button').first().waitFor();
    assert.equal(await page.locator('.prompts button').count(), 4);
    await page.getByRole('button', { name: t.prompt1, exact: true }).click();
    let entry = await next();
    assert.equal(await page.locator('.prompts').count(), 0);
    await finish(entry);
    assert.equal(await page.locator('.prompts').count(), 0);
    await page.getByRole('button', { name: t.minimizeAsk, exact: true }).click();
    await page.locator('.ask-launcher').click();
    assert.equal(await page.locator('.prompts').count(), 0);
    record('首次显示推荐，发送后及收起重开不再显示');
    entry = await send('首尔未来六小时会下雨吗？');
    await finish(entry);
    assert.equal(await input.inputValue(), '');
    record('点击发送立即清空，成功后保持空白');
    entry = await send('那下午呢？', true);
    await input.fill('接下来想问温度');
    await finish(entry);
    assert.equal(await input.inputValue(), '接下来想问温度');
    record('Enter 发送清空，成功回答不覆盖新草稿');
    entry = await send('失败后需要重试的问题');
    await finish(entry, 503);
    assert.equal(await page.locator('.prompts').count(), 0);
    assert.equal(await input.inputValue(), '失败后需要重试的问题');
    record('失败且未编辑时恢复原问题');
    entry = await send('失败时仍有新问题');
    await input.fill('新草稿不能被替换');
    await finish(entry, 429);
    assert.equal(await input.inputValue(), '新草稿不能被替换');
    record('失败不覆盖请求期间的新草稿');
    entry = await send('网络断开的问题');
    await finish(entry, 0);
    assert.equal(await input.inputValue(), '网络断开的问题');
    record('网络中断后保留可重试文本');
    const beforeBlank = bodies.length;
    await input.fill('   ');
    assert.equal(await page.locator('.ask-submit').isDisabled(), true);
    await input.press('Enter');
    assert.equal(bodies.length, beforeBlank);
    record('空白输入不发送');
    const context = {
      origin: '37.566,126.9784',
      createdAt: Date.now(),
      alignmentZone: null,
      cities: [
        {
          id: 1835848,
          lat: 37.566,
          lon: 126.9784,
          name: '首尔',
          country: '韩国',
          version: 'controlled-seoul',
        },
        {
          id: 1668341,
          lat: 25.0478,
          lon: 121.5319,
          name: '台北',
          country: '台湾',
          version: 'controlled-taipei',
        },
      ],
      plan: { intent: 'rain', window: 'local', startDay: 1, dayCount: 1, fromHour: 7, toHour: 9 },
    };
    entry = await send('比较首尔与台北明早降雨');
    await finish(entry, 200, context);
    assert.equal(await page.locator('.prompts').count(), 0);
    entry = await send(t.followAfternoon);
    assert.equal(await input.inputValue(), '');
    assert.deepEqual(entry.body.context, context);
    const afternoon = { ...context, plan: { ...context.plan, fromHour: 12, toHour: 17 } };
    await finish(entry, 200, afternoon);
    record('隐藏推荐后，输入连续追问仍清空输入并保留上下文');
    entry = await send('哪个更冷？');
    await input.fill('正在写的另一个问题');
    await finish(entry, 409);
    assert.equal(await input.inputValue(), '正在写的另一个问题');
    await page.getByRole('button', { name: t.refreshForecasts, exact: true }).click();
    entry = await next();
    assert.equal(entry.body.question, '哪个更冷？');
    assert.equal(await input.inputValue(), '正在写的另一个问题');
    await finish(entry, 200, afternoon);
    assert.equal(await input.inputValue(), '正在写的另一个问题');
    record('409 刷新重试发送原问题，保留后来输入的草稿');
    entry = await send('等待失败时主动清空');
    await input.fill('临时草稿');
    await input.fill('');
    await finish(entry, 503);
    assert.equal(await input.inputValue(), '');
    record('主动清空后不被迟到错误重新填回');
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
await writeFile(
  new URL('./evidence/ask-draft-check.json', import.meta.url),
  JSON.stringify(
    { at: new Date().toISOString(), base, controlledResponses: true, modelCalls: 0, rows, errors },
    null,
    2,
  ),
);
console.log(JSON.stringify({ passed: rows.length, modelCalls: 0, errors }));
