// 显式运行会调用已配置的真实模型；QA_SOURCE=rules 时验收无密钥服务。
import assert from 'node:assert/strict';
import { askSse } from './lib/ask-sse.ts';
import { errorInfo } from '../web/lib/errors.ts';
import { chromium } from 'playwright-core';
import { readAnswer } from './lib/json.ts';
import { decode, requireValue, isRecord } from '../web/lib/validation.ts';
import { validateInput } from '../web/lib/ask.ts';
import { validSingleContext } from '../web/lib/contracts.ts';
import { writeFile } from 'node:fs/promises';
import type { AskResult, SingleContext, HourWeather } from '../web/lib/types.ts';
const base = process.env.APP_URL || 'http://127.0.0.1:3319';
const source = process.env.QA_SOURCE || 'model';
assert(['model', 'rules'].includes(source));
const width = source === 'model' ? 390 : 1440;
const browser = await chromium.launch({ headless: true });
const rows: unknown[] = [],
  errors: string[] = [];
let attempts = 0;
let refreshedContext = false;
try {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    ignoreHTTPSErrors: false,
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base + '/zh-Hans/weather/seoul-1835848');
  await page.locator('.hour').first().waitFor();
  await page.locator('.ask-launcher').click();
  const cases = ['今天广州天气怎样', '明天呢', '那下午呢', '会下雨吗'];
  let firstCity: number | string | undefined;
  let lastResult: AskResult | undefined;
  for (const [index, question] of cases.entries()) {
    await page.locator('#weather-question').fill(question);
    const started = performance.now();
    let responsePromise = page.waitForResponse(
      (response) => response.url().endsWith('/api/ask') && response.request().method() === 'POST',
    );
    await page.locator('.ask-submit').click();
    let response = await responsePromise;
    attempts++;
    if (response.status() === 409) {
      responsePromise = page.waitForResponse(
        (response) => response.url().endsWith('/api/ask') && response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: '刷新预报并重试', exact: true }).click();
      response = await responsePromise;
      attempts++;
    }
    assert.equal(response.status(), 200, await response.text());
    let data: AskResult;
    try {
      data = await readAnswer(response);
    } catch (error) {
      if (!/"status"\s*:\s*409/.test(errorInfo(error).message)) throw error;
      responsePromise = page.waitForResponse(
        (response) => response.url().endsWith('/api/ask') && response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: '刷新预报并重试', exact: true }).click();
      response = await responsePromise;
      attempts++;
      data = await readAnswer(response);
    }
    lastResult = data;
    await writeFile(
      new URL(`./evidence/single-city-${source}-last-response.json`, import.meta.url),
      JSON.stringify(
        { at: new Date().toISOString(), round: index + 1, status: response.status(), data },
        null,
        2,
      ),
    );
    assert.equal(data.source, source);
    if (source === 'model') assert.equal(data.model, 'gpt-6-luna');
    assert(data.singleForecast && data.singleContext);
    assert.equal(data.singleForecast.forecast.source, 'open-meteo');
    assert.equal(data.singleForecast.forecast.timezone, 'Asia/Shanghai');
    assert(Math.abs(data.singleContext.city.lat - 23.1) < 0.5);
    assert(Math.abs(data.singleContext.city.lon - 113.3) < 0.5);
    firstCity ??= data.singleContext.city.id;
    assert.equal(data.singleContext.city.id, firstCity);
    assert(data.answer.includes(data.singleForecast.city.name));
    await page
      .locator('.answer > p')
      .filter({ hasText: data.singleForecast.city.name })
      .last()
      .waitFor();
    assert.equal(await page.locator('.prompts').count(), 0);
    assert.equal(await page.locator('#weather-question').inputValue(), '');
    if (index < 2) {
      assert.equal(data.dailyEvidence?.length, 1);
      assert.equal(data.singleContext.plan.intent, 'daily');
      assert.equal(data.singleContext.plan.window, 'days');
      if (data.singleContext.plan.window === 'days')
        assert.equal(data.singleContext.plan.startDay, index);
      const day = requireValue(data.dailyEvidence)[0];
      assert.deepEqual(
        data.singleForecast.forecast.days.find((row) => row.date === day.date),
        day,
      );
    } else {
      assert.equal(data.singleContext.plan.intent, index === 2 ? 'temperature' : 'rain');
      assert.equal(data.singleContext.plan.window, 'local');
      if (data.singleContext.plan.window === 'local') {
        assert.equal(data.singleContext.plan.startDay, 1);
        assert.equal(data.singleContext.plan.fromHour, 12);
        assert.equal(data.singleContext.plan.toHour, 17);
      }
      assert(data.evidence.length > 0);
      for (const entry of data.evidence) {
        assert.equal(entry.city?.id, firstCity);
        assert.equal(entry.version, data.singleForecast.forecast.version);
        const hour: HourWeather | undefined = data.singleForecast.forecast.comparisonHours?.find(
          (hour) => hour.time === entry.time,
        );
        assert(hour);
        assert.equal(entry.temp, hour.temp);
        assert.equal(entry.rain, hour.rain);
      }
    }
    if (index === 0)
      await page.screenshot({
        path: new URL(`./evidence/single-city-${source}-answer.png`, import.meta.url).pathname,
      });
    await page
      .locator('.ask-conversation .answer')
      .last()
      .locator('.evidence button')
      .first()
      .click();
    const preview = page.getByTestId('city-forecast');
    await preview.waitFor();
    assert((await preview.locator('h3').innerText()).includes(data.singleForecast.city.name));
    assert((await preview.innerText()).includes('Asia/Shanghai'));
    if (index === 0 || index === 2)
      await page.screenshot({
        path: new URL(
          `./evidence/single-city-${source}-${index === 0 ? 'day' : 'hour'}.png`,
          import.meta.url,
        ).pathname,
      });
    await preview.getByRole('button', { name: '返回', exact: true }).click();
    await page.locator('#weather-question').waitFor();
    rows.push({
      round: index + 1,
      source,
      model: data.model,
      ms: Math.round(performance.now() - started),
      city: data.singleForecast.city,
      version: data.singleForecast.forecast.version,
      plan: data.singleContext.plan,
      dailyEvidence: data.dailyEvidence,
      evidence: data.evidence,
      forecastSource: data.singleForecast.forecast.source,
      preview: '对应城市预报已打开并返回',
    });
  }
  if (source === 'rules') {
    assert(lastResult?.singleContext && lastResult.singleForecast);
    const freshVersion = lastResult.singleForecast.forecast.version + '-controlled-refresh';
    let controlledRequests = 0;
    const previous = {
      ...lastResult,
      singleContext: lastResult.singleContext,
      singleForecast: lastResult.singleForecast,
    };
    await page.route('**/api/weather?*', async (route) => {
      const query = new URL(route.request().url()).searchParams;
      if (Math.abs(Number(query.get('lat')) - previous.singleContext.city.lat) < 0.001)
        await route.fulfill({
          json: { ...previous.singleForecast.forecast, version: freshVersion },
        });
      else await route.continue();
    });
    await page.route('**/api/ask', async (route) => {
      controlledRequests++;
      if (controlledRequests === 1) {
        await route.fulfill({ status: 409, json: { code: 'STALE_FORECAST' } });
        return;
      }
      const raw: unknown = route.request().postDataJSON();
      const record = decode(raw, isRecord);
      const input = validateInput(raw);
      const body = {
        ...input,
        context: record.context,
        singleContext: decode(record.singleContext, validSingleContext),
      };
      assert.equal(body.question, '会下雨吗');
      assert.equal(body.context, null);
      assert.equal(body.singleContext.city.id, firstCity);
      assert.equal(body.singleContext.city.version, freshVersion);
      assert.equal(body.singleContext.dateAnchor, previous.singleContext.dateAnchor);
      const updated = {
        ...previous,
        singleContext: body.singleContext,
        singleForecast: {
          ...previous.singleForecast,
          forecast: { ...previous.singleForecast.forecast, version: freshVersion },
        },
        evidence: previous.evidence.map((entry) => ({ ...entry, version: freshVersion })),
      };
      await route.fulfill(askSse(updated));
    });
    await page.locator('#weather-question').fill('会下雨吗');
    await page.locator('.ask-submit').click();
    const refreshButton = page.getByRole('button', { name: '刷新预报并重试', exact: true });
    await refreshButton.waitFor();
    const retryResponse = page.waitForResponse(
      (response) => response.url().endsWith('/api/ask') && response.request().method() === 'POST',
    );
    await refreshButton.click();
    const retried = await readAnswer(await retryResponse);
    assert.equal(retried.singleContext?.city.version, freshVersion);
    await page
      .locator('.answer > p')
      .filter({ hasText: previous.singleForecast.city.name })
      .last()
      .waitFor();
    assert.equal(controlledRequests, 2);
    refreshedContext = true;
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
await writeFile(
  new URL(`./evidence/single-city-${source}.json`, import.meta.url),
  JSON.stringify(
    { at: new Date().toISOString(), base, width, source, attempts, rows, refreshedContext, errors },
    null,
    2,
  ),
);
console.log(JSON.stringify({ source, passed: rows.length, attempts, refreshedContext, errors }));
