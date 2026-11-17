// model 模式使用已配置服务真实调用；rules 模式连接显式空密钥候选服务。
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';
import { readAnswer } from './lib/json.ts';
import { errorInfo } from '../web/lib/errors.ts';
import { labels, condition } from '../web/lib/ui-text.ts';
import { requireValue } from '../web/lib/validation.ts';
import type { AskResult, Locale } from '../web/lib/types.ts';

const source = process.env.QA_SOURCE || 'model';
assert(source === 'rules' || source === 'model');
const base = process.env.APP_URL || 'http://127.0.0.1:3319';
const maxSteps = Number(process.env.QA_MAX_STEPS || 8);
assert(Number.isInteger(maxSteps) && maxSteps >= 1 && maxSteps <= 8);
const run = process.env.QA_RUN || `weather-advice-${source}`;
assert(/^[a-z0-9-]+$/.test(run));
const browser = await chromium.launch({ headless: true });
const rows: unknown[] = [],
  errors: string[] = [];
let attempts = 0;
const prompts: Record<Locale, string[]> = {
  'zh-Hans': [
    '今天广州天气怎样',
    '出门穿什么衣服',
    '明天呢',
    '那下午呢',
    '适合跑步吗',
    '需要防晒吗',
    '可以晾衣服吗',
    '会下雪吗',
  ],
  'zh-Hant': [
    '今天广州天气怎样',
    '出門穿什麼衣服',
    '明天呢',
    '那下午呢',
    '適合騎車嗎',
    '需要防曬嗎',
    '可以晾衣服嗎',
    '會下雪嗎',
  ],
  en: [
    'weather in Guangzhou, Guangdong, China today',
    'What should I wear?',
    'Tomorrow?',
    'And the afternoon?',
    'Is outdoor running suitable?',
    'Do I need sunscreen?',
    'Can I dry laundry?',
    'Will there be snow?',
  ],
  ko: [
    '광저우 날씨',
    '무슨 옷을 입을까요?',
    '내일은요?',
    '그럼 오후는요?',
    '야외 달리기 괜찮을까요?',
    '선크림이 필요할까요?',
    '빨래를 널어도 되나요?',
    '눈이 올까요?',
  ],
};
try {
  const locales: Locale[] = source === 'model' ? ['zh-Hans'] : ['zh-Hans', 'zh-Hant', 'en', 'ko'];
  for (const [index, locale] of locales.entries()) {
    const width = source === 'model' ? 390 : [1440, 1024, 768, 390][index];
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: source === 'model' ? 'no-preference' : 'reduce',
    });
    const t = labels(locale);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/${locale}/weather/seoul-1835848`);
    await page.locator('.hour').first().waitFor();
    await page.locator('.ask-launcher').click();
    const expected = [
      'daily',
      'clothing',
      'clothing',
      'clothing',
      'outdoor',
      'sun',
      'laundry',
      'conditions',
    ];
    for (const [step, question] of prompts[locale].entries()) {
      if (step >= maxSteps) break;
      if (source === 'rules' && index > 0 && step >= 4) break;
      const started = performance.now();
      await page.locator('#weather-question').fill(question);
      const network = page.waitForResponse((response) => response.url().endsWith('/api/ask'));
      await page.locator('.ask-submit').click();
      let result: AskResult;
      attempts++;
      try {
        result = await readAnswer(await network);
      } catch (error) {
        if (!/"status"\s*:\s*409/.test(errorInfo(error).message)) throw error;
        const button = page.getByRole('button', { name: t.refreshForecasts, exact: true });
        await button.waitFor();
        const retry = page.waitForResponse((response) => response.url().endsWith('/api/ask'));
        await button.click();
        attempts++;
        result = await readAnswer(await retry);
      }
      await page.waitForFunction(() => !document.querySelector('.ask-working'));
      assert.equal(result.source, source);
      if (source === 'model') assert.equal(result.model, 'gpt-6-luna');
      const forecast = requireValue(result.singleForecast).forecast;
      assert.equal(forecast.source, 'open-meteo');
      assert.equal(forecast.timezone, 'Asia/Shanghai');
      assert(Math.abs(requireValue(result.singleContext).city.lat - 23.1) < 0.5);
      assert.equal(result.singleContext?.plan.intent, expected[step]);
      if (step === 0)
        assert(
          result.answer.includes(condition(requireValue(result.dailyEvidence)[0].code, locale)),
        );
      else {
        assert.equal(result.singleContext?.plan.window, 'local');
        if (result.singleContext?.plan.window === 'local') {
          assert.equal(result.singleContext.plan.startDay, step < 2 ? 0 : 1);
          assert.equal(result.singleContext.plan.fromHour, step < 3 ? 0 : 12);
          assert.equal(result.singleContext.plan.toHour, step < 3 ? 23 : 17);
        }
        assert(result.evidence.length > 0);
        for (const item of result.evidence) {
          const hour = forecast.comparisonHours?.find((hour) => hour.time === item.time);
          assert(hour);
          assert.equal(item.temp, hour.temp);
          assert.equal(item.rain, hour.rain);
          assert.equal(item.code, hour.code);
          assert.equal(item.version, forecast.version);
        }
      }
      assert.equal(
        await page.locator('.ask-conversation .answer > p').last().innerText(),
        result.answer,
      );
      assert.equal(await page.locator('.prompts').count(), 0);
      await page
        .locator('.ask-conversation .answer')
        .last()
        .locator('.evidence button')
        .first()
        .click();
      const preview = page.getByTestId('city-forecast');
      assert((await preview.innerText()).includes('Asia/Shanghai'));
      await preview.getByRole('button', { name: t.back, exact: true }).click();
      if (step === 1)
        await page.screenshot({
          path: new URL(`./evidence/${run}-${locale}.png`, import.meta.url).pathname,
        });
      rows.push({
        locale,
        width,
        step: step + 1,
        question,
        source,
        city: result.singleForecast?.city,
        plan: result.singleContext?.plan,
        answer: result.answer,
        version: forecast.version,
        evidence: result.evidence,
        dailyEvidence: result.dailyEvidence,
        ms: Math.round(performance.now() - started),
      });
    }
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await writeFile(
    new URL(`./evidence/${run}.json`, import.meta.url),
    JSON.stringify({ at: new Date().toISOString(), base, source, attempts, rows, errors }, null, 2),
  );
}
console.log(JSON.stringify({ source, passed: rows.length, attempts, errors }));
