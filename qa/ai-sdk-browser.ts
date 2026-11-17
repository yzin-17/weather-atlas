import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSharedStore } from '../web/lib/shared-store.ts';
import { chromium } from 'playwright-core';
import { labels } from '../web/lib/ui-text.ts';
import type { Locale } from '../web/lib/types.ts';

// 本地模型 HTTP 桩；验证真实 Next → 模型 HTTP 取消链路，不调用外部模型。
let mode: 'fast' | 'limited' | 'hold' | 'invalid' = 'fast';
let calls = 0,
  cancelled = 0,
  onHold = () => {},
  onCancel = () => {};
const model = http.createServer((request, response) => {
  request.resume();
  calls++;
  console.log(JSON.stringify({ fixtureCall: calls, mode }));
  if (mode === 'hold') {
    response.on('close', () => {
      if (!response.writableEnded) {
        cancelled++;
        onCancel();
      }
    });
    onHold();
    return;
  }
  response.writeHead(mode === 'limited' ? 429 : 200, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify(
      mode === 'invalid'
        ? { choices: [] }
        : {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    intent: 'temperature',
                    window: 'now',
                    cityQuery: null,
                  }),
                },
              },
            ],
          },
    ),
  );
});
await new Promise<void>((resolve) => model.listen(0, '127.0.0.1', resolve));
const address = model.address();
assert(address && typeof address === 'object');
const port = Number(process.env.QA_PORT || 3318),
  base = `http://127.0.0.1:${port}`;
const cache = await mkdtemp(path.join(tmpdir(), 'atlas-sdk-browser-'));
const app = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
  {
    cwd: new URL('../web/', import.meta.url),
    detached: true,
    env: {
      ...process.env,
      NEXT_DIST_DIR: process.env.QA_DIST_DIR || '.next',
      WEATHER_MODE: 'demo',
      WEATHER_CACHE_DIR: cache,
      AI_API_KEY: 'controlled-fixture',
      AI_BASE_URL: `http://127.0.0.1:${address.port}`,
      AI_MODEL: 'controlled-fixture',
      SITE_URL: 'http://localhost:3300',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let log = '';
app.stdout.on('data', (buffer: Buffer) => {
  log += buffer.toString();
});
app.stderr.on('data', (buffer: Buffer) => {
  log += buffer.toString();
});
const browser = await chromium.launch({ headless: true });
const rows: unknown[] = [],
  errors: string[] = [];
const run = process.env.QA_AI_SDK_RUN || 'ai-sdk';
assert(/^[a-z0-9-]+$/.test(run));
async function deadline<T>(promise: Promise<T>) {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(Error('等待超时')), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
try {
  await deadline(
    new Promise<void>((resolve, reject) => {
      if (log.includes('Ready')) {
        resolve();
        return;
      }
      app.stdout.on('data', (buffer: Buffer) => {
        if (buffer.toString().includes('Ready')) resolve();
      });
      app.once('exit', (code) => reject(Error(`候选服务退出 ${code}`)));
    }),
  );
  for (const width of [1440, 1024, 768, 390])
    for (const locale of ['zh-Hans', 'zh-Hant', 'en', 'ko'] satisfies Locale[]) {
      await createSharedStore(cache).write('ask-budget', []);
      mode = 'fast';
      const t = labels(locale),
        page = await browser.newPage({ viewport: { width, height: 900 } });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${base}/${locale}/weather/seoul-1835848`);
      await page.locator('.hour').first().waitFor();
      await page.locator('.ask-launcher').click();
      const input = page.locator('#weather-question');
      const send = async (text: string) => {
        await input.fill(text);
        await page.locator('.ask-submit').click();
      };
      const done = async (expected: number) => {
        await page.waitForFunction(
          (expected) =>
            document.querySelectorAll('.ask-conversation .answer .list-caption').length ===
            expected,
          expected,
        );
        await page.waitForFunction(() => !document.querySelector('.ask-working'));
      };
      const response = page.waitForResponse((response) => response.url().endsWith('/api/ask'));
      await send('current temperature');
      const first = await response;
      assert((await first.allHeaders())['content-type']?.includes('text/event-stream'));
      await done(1);
      assert.equal(await input.inputValue(), '');
      assert.equal(await page.locator('.prompts').count(), 0);
      assert.equal(await page.locator('.ask-question').count(), 1);
      mode = 'limited';
      await send('current temperature again');
      await page.getByRole('alert').filter({ hasText: t.limited }).waitFor();
      assert.equal(await input.inputValue(), '');
      const count = await page.locator('.ask-question').count();
      await input.fill('keep this draft');
      mode = 'fast';
      await page.getByRole('alert').getByRole('button', { name: t.retry, exact: true }).click();
      await done(2);
      assert.equal(await page.locator('.ask-question').count(), count);
      assert.equal(await input.inputValue(), 'keep this draft');
      mode = 'hold';
      const held = new Promise<void>((resolve) => {
        onHold = resolve;
      });
      const aborted = new Promise<void>((resolve) => {
        onCancel = resolve;
      });
      const before = cancelled;
      const heldAt = Date.now();
      await send('current temperature stop');
      await deadline(held);
      console.log(JSON.stringify({ stage: 'model-held', elapsed: Date.now() - heldAt, calls }));
      await page
        .locator('.ask-working')
        .filter({ hasText: t.askPlanning })
        .waitFor({ timeout: 5000 });
      console.log(JSON.stringify({ stage: 'progress-visible', elapsed: Date.now() - heldAt }));
      const progressVisibleBeforeModelFinished = await page.locator('.ask-working').isVisible();
      await input.fill('draft during generation');
      await page.getByRole('button', { name: t.askStop, exact: true }).click();
      await deadline(aborted);
      await page.getByRole('status').filter({ hasText: t.askStopped }).waitFor();
      assert.equal(cancelled, before + 1);
      assert.equal(await input.inputValue(), 'draft during generation');
      const stoppedCount = await page.locator('.ask-question').count();
      mode = 'fast';
      await page.getByRole('status').getByRole('button', { name: t.retry, exact: true }).click();
      await done(3);
      assert.equal(await page.locator('.ask-question').count(), stoppedCount);
      assert.equal(await input.inputValue(), 'draft during generation');
      mode = 'invalid';
      await send('invalid response');
      await page
        .locator('#weather-ask-panel')
        .getByRole('alert')
        .filter({ hasText: t.offline })
        .waitFor();
      assert.equal(await input.inputValue(), '');
      mode = 'fast';
      await page.getByRole('alert').getByRole('button', { name: t.retry, exact: true }).click();
      await done(4);
      assert.equal(await page.locator('.ask-question').count(), stoppedCount + 1);
      assert.equal(await page.locator('.ask-conversation .answer .list-caption').count(), 4);
      await page.route(
        '**/api/ask',
        (route) =>
          route.fulfill({
            contentType: 'text/event-stream',
            body: 'data: {"type":"start"}\n\ndata: {"type":"error","errorText":"{\\"status\\":503,\\"code\\":\\"FORECAST_UNAVAILABLE\\"}"}\n\ndata: [DONE]\n\n',
          }),
        { times: 2 },
      );
      await send('forecast unavailable');
      const forecastError = page.getByRole('alert').filter({ hasText: t.askForecast });
      await forecastError.waitFor();
      assert.equal(await input.inputValue(), '');
      const failedCount = await page.locator('.ask-question').count();
      await forecastError.getByRole('button', { name: t.retry, exact: true }).click();
      await forecastError.waitFor();
      await page.waitForFunction(() => !document.querySelector('.ask-working'));
      assert.equal(await input.inputValue(), '');
      assert.equal(await page.locator('.ask-question').count(), failedCount);
      await input.fill('forecast unavailable');
      await forecastError.getByRole('button', { name: t.retry, exact: true }).click();
      await done(5);
      assert.equal(await input.inputValue(), 'forecast unavailable');
      let forceStale = true;
      await page.route('**/api/ask', async (route) => {
        if (forceStale) {
          forceStale = false;
          await route.continue({
            postData: JSON.stringify({
              ...route.request().postDataJSON(),
              version: 'controlled-old-version',
            }),
          });
        } else await route.continue();
      });
      await send('refresh the forecast');
      await page
        .locator('#weather-ask-panel')
        .getByRole('alert')
        .filter({ hasText: t.askChanged })
        .waitFor();
      await page.getByRole('button', { name: t.refreshForecasts, exact: true }).click();
      await done(6);
      assert.equal(await page.locator('.ask-question').count(), stoppedCount + 3);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      if (width === 390 && locale === 'zh-Hans')
        await page.screenshot({
          path: new URL(`./evidence/${run}-history-mobile.png`, import.meta.url).pathname,
        });
      rows.push({
        width,
        locale,
        sse: true,
        progressVisibleBeforeModelFinished,
        retryWithoutDuplicate: true,
        upstreamCancelled: true,
        draftPreserved: true,
        historyAnswers: 6,
        failureDoesNotRestoreDraft: true,
        forecastFailureExplained: true,
        staleStreamRefreshed: true,
      });
      await page.close();
    }
  assert.deepEqual(errors, []);
} catch (error) {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .at(-1);
  if (page) {
    await page.screenshot({
      path: new URL(`./evidence/${run}-browser-failure.png`, import.meta.url).pathname,
    });
    await writeFile(
      new URL(`./evidence/${run}-browser-failure.json`, import.meta.url),
      JSON.stringify(
        {
          page: await page.locator('#weather-ask-panel').innerText(),
          cancelled,
          calls,
          errors,
        },
        null,
        2,
      ),
    );
  }
  throw error;
} finally {
  await browser.close();
  if (app.pid) {
    try {
      process.kill(-app.pid, 'SIGTERM');
    } catch {}
  }
  model.closeAllConnections();
  await new Promise<void>((resolve) => model.close(() => resolve()));
  await writeFile(new URL(`./evidence/${run}-browser-server.log`, import.meta.url), log);
  await rm(cache, { recursive: true, force: true });
}
await writeFile(
  new URL(`./evidence/${run}-browser.json`, import.meta.url),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      externalModelCalls: 0,
      fixtureModelCalls: calls,
      cancelled,
      rows,
      errors,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    passed: rows.length,
    cancelled,
    fixtureModelCalls: calls,
    externalModelCalls: 0,
    errors,
  }),
);
