import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { locales } from '../web/lib/catalog.ts';
import { timeLabel } from '../web/lib/format.ts';
import { labels } from '../web/lib/ui-text.ts';
import { validAskResult } from '../web/lib/contracts.ts';
import { decode, isRecord, parseJson, requireValue } from '../web/lib/validation.ts';
import type { AskResult, Locale } from '../web/lib/types.ts';

const base = process.env.APP_URL || 'http://127.0.0.1:3332';
const questions: Record<Locale, string[]> = {
  'zh-Hans': ['首尔和台北明天早上7–9点哪里更容易下雨？', '那下午呢？', '哪个更冷？'],
  'zh-Hant': ['首爾和台北明天早上7–9點哪裡更容易下雨？', '那下午呢？', '哪個更冷？'],
  en: [
    'Compare Seoul and Taipei rain tomorrow morning 7–9',
    'What about afternoon?',
    'Which is colder?',
  ],
  ko: [
    '서울과 타이베이 내일 아침 7–9시 어디가 비가 올 확률이 높아요?',
    '오후는요?',
    '어느 곳이 더 추워요?',
  ],
};
function streamedAnswer(body: string): AskResult {
  let result: AskResult | undefined;
  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
    const event = parseJson(line.slice(6));
    if (isRecord(event) && event.type === 'data-weather')
      result = decode(event.data, validAskResult);
    if (isRecord(event) && event.type === 'error') throw Error(String(event.errorText));
  }
  return requireValue(result, 'Missing weather event');
}
const browser = await chromium.launch({ headless: true });
const rows: {
  locale: Locale;
  round: number;
  cities: string[];
  evidence: number;
  preview: boolean;
}[] = [];
const errors: string[] = [];
try {
  for (const locale of locales) {
    const context = await browser.newContext({
      viewport: { width: locale === 'en' ? 1440 : 390, height: 900 },
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/${locale}/weather/seoul-1835848`);
    await page.locator('.hour').first().waitFor();
    await page.locator('.ask-launcher').click();
    for (const [index, question] of questions[locale].entries()) {
      await page.locator('#weather-question').fill(question);
      const incoming = page.waitForResponse(
        (response) => response.url().endsWith('/api/ask') && response.request().method() === 'POST',
      );
      await page.locator('.ask-submit').click();
      const response = await incoming;
      assert.equal(response.status(), 200);
      const answer = response.headers()['content-type']?.includes('text/event-stream')
        ? streamedAnswer(await response.text())
        : decode(await response.json(), validAskResult);
      assert.equal(answer.source, 'rules');
      const comparisons = requireValue(
          answer.comparisons,
          `${locale} round ${index + 1}: ${answer.answer}`,
        ),
        plan = requireValue(answer.context).plan;
      assert.equal(comparisons.length, 2);
      assert.equal(plan.intent, index === 2 ? 'temperature' : 'rain');
      assert.equal(plan.fromHour, index === 0 ? 7 : 12);
      assert.equal(plan.toHour, index === 0 ? 9 : 17);
      for (const city of comparisons) {
        assert(city.complete);
        const forecast = requireValue(city.forecast);
        assert.equal(forecast.version, city.version);
        for (const entry of city.evidence) {
          const hour = requireValue(
            forecast.comparisonHours?.find((sample) => sample.time === entry.time),
          );
          assert.equal(entry.temp, hour.temp);
          assert.equal(entry.rain, hour.rain);
          assert.equal(entry.city?.lat, city.city.lat);
        }
      }
      const target = requireValue(comparisons[1]);
      const evidence = page
        .locator('.answer')
        .last()
        .locator('.evidence button')
        .filter({ hasText: target.city.name })
        .first();
      await evidence.click();
      const preview = page.getByTestId('comparison-forecast');
      await preview.waitFor();
      assert((await preview.locator('h3').innerText()).includes(target.city.name));
      assert((await preview.innerText()).includes(requireValue(target.timezone)));
      assert((await preview.innerText()).includes(requireValue(target.date)));
      assert.equal(
        await preview.locator('.selected-reading time').innerText(),
        timeLabel(requireValue(target.evidence[0]).time, locale, requireValue(target.timezone)),
      );
      await preview.getByRole('button', { name: labels(locale).back, exact: true }).click();
      rows.push({
        locale,
        round: index + 1,
        cities: comparisons.map((city) => city.city.name),
        evidence: comparisons.reduce((count, city) => count + city.evidence.length, 0),
        preview: true,
      });
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await writeFile(
    new URL('./evidence/type-audit-browser.json', import.meta.url),
    JSON.stringify({ at: new Date().toISOString(), rows, errors, realModelCalls: 0 }, null, 2),
  );
}
console.log(JSON.stringify({ rounds: rows.length, errors, realModelCalls: 0 }));
