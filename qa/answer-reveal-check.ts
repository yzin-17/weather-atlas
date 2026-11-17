// 仅在浏览器拦截问答响应，不请求外部模型；校验前端展示与 SDK 生命周期。
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { askSse } from './lib/ask-sse.ts';
import { decode, isRecord, requireValue } from '../web/lib/validation.ts';
import { validAskResult } from '../web/lib/contracts.ts';
import { labels } from '../web/lib/ui-text.ts';
import type { Locale } from '../web/lib/types.ts';

const base = process.env.APP_URL || 'http://127.0.0.1:3319';
const stored: unknown = JSON.parse(
  await readFile(
    new URL('./evidence/single-city-model-last-response.json', import.meta.url),
    'utf8',
  ),
);
const fixture = decode(decode(stored, isRecord).data, validAskResult);
assert(fixture.singleContext && fixture.singleForecast);
const full = {
  'zh-Hans': '广州今天有降雨可能，出门请带伞，午后注意天气变化。',
  'zh-Hant': '廣州今天有降雨可能，出門請帶傘，午後留意天氣變化。',
  en: 'Rain is possible in Guangzhou today. Bring an umbrella.',
  ko: '오늘 광저우에는 비가 올 수 있습니다. 외출할 때 우산을 챙기세요.',
};
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const browser = await chromium.launch({ headless: true });
const rows: unknown[] = [],
  errors: string[] = [];
let requests = 0;
try {
  for (const width of [1440, 1024, 768, 390])
    for (const locale of ['zh-Hans', 'zh-Hant', 'en', 'ko'] satisfies Locale[]) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        reducedMotion: 'no-preference',
      });
      const t = labels(locale),
        before = requests;
      const answer = `广州 · Asia/Shanghai\n${full[locale]}\n👨‍👩‍👧‍👦 🇰🇷 한글 é`;
      const prefixes = new Set(['']);
      let prefix = '';
      for (const { segment } of segmenter.segment(answer)) {
        prefix += segment;
        prefixes.add(prefix);
      }
      let short = false;
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/ask', async (route) => {
        requests++;
        const raw: unknown = route.request().postDataJSON();
        assert(isRecord(raw));
        if (requests === before + 2) assert.deepEqual(raw.singleContext, fixture.singleContext);
        await route.fulfill(askSse({ ...fixture, answer: short ? '广州 · 后续回答' : answer }));
      });
      await page.goto(`${base}/${locale}/weather/seoul-1835848`);
      await page.locator('.hour').first().waitFor();
      await page.locator('.ask-launcher').click();
      const input = page.locator('#weather-question');
      const send = async (question: string) => {
        const network = page.waitForResponse((response) => response.url().endsWith('/api/ask'));
        await input.fill(question);
        await page.locator('.ask-submit').click();
        await (await network).finished();
      };
      const paragraph = () => page.locator('.ask-conversation .answer > p').last();
      const partial = async () => {
        await page.waitForFunction((full) => {
          const paragraphs = document.querySelectorAll('.ask-conversation .answer > p');
          const text = paragraphs.item(paragraphs.length - 1)?.textContent || '';
          return text.length > 0 && text.length < full.length;
        }, answer);
        await page.locator('.ask-working').filter({ hasText: t.askDisplaying }).waitFor();
        const text = await paragraph().innerText();
        assert(prefixes.has(text));
        return text;
      };
      const complete = async () => {
        await page.waitForFunction(() => !document.querySelector('.ask-working'));
      };
      await send('今天广州天气怎样');
      const first = await partial();
      assert.equal(await page.locator('.answer .evidence').count(), 0);
      await page.waitForTimeout(100);
      const later = await paragraph().innerText();
      assert(later.length > first.length && later.length < answer.length);
      assert(prefixes.has(later));
      if (width === 390 && locale === 'zh-Hans') {
        await page.waitForTimeout(400);
        await page.screenshot({
          path: new URL('./evidence/answer-reveal-progress.png', import.meta.url).pathname,
        });
      }
      await input.fill('保留这份新草稿');
      await page.getByRole('button', { name: t.askStop, exact: true }).click();
      const frozen = await paragraph().innerText();
      await page.waitForTimeout(200);
      assert.equal(await paragraph().innerText(), frozen);
      assert.equal(await input.inputValue(), '保留这份新草稿');
      assert.equal(requests, before + 1);
      if (width === 390 && locale === 'zh-Hans')
        await page.screenshot({
          path: new URL('./evidence/answer-reveal-stopped.png', import.meta.url).pathname,
        });
      await page.getByRole('button', { name: t.minimizeAsk, exact: true }).click();
      await page.locator('.ask-launcher').click();
      assert.equal(await paragraph().innerText(), frozen);
      short = true;
      await send('那下午呢');
      await complete();
      assert.equal(await page.locator('.ask-conversation .answer > p').first().innerText(), frozen);
      assert.equal(await page.locator('.ask-question').count(), 2);
      assert.equal(await page.locator('.prompts').count(), 0);
      short = false;
      await send('再看广州天气');
      await partial();
      await page.getByRole('button', { name: t.askStop, exact: true }).click();
      await page.getByRole('status').filter({ hasText: t.askStopped }).waitFor();
      await input.fill('重试不要覆盖草稿');
      const samplesPromise = page.evaluate(
        () =>
          new Promise<string[]>((resolve, reject) => {
            const samples: string[] = [];
            let started = false;
            const observer = new MutationObserver(() => {
              const working = !!document.querySelector('.ask-working');
              started ||= working;
              const paragraphs = document.querySelectorAll('.ask-conversation .answer > p');
              if (paragraphs.length === 3) samples.push(paragraphs.item(2).textContent || '');
              if (started && !working) {
                observer.disconnect();
                clearTimeout(timer);
                resolve(samples);
              }
            });
            const timer = setTimeout(() => {
              observer.disconnect();
              reject(Error('逐字采样超时'));
            }, 15000);
            observer.observe(document.body, {
              childList: true,
              characterData: true,
              subtree: true,
            });
          }),
      );
      await page
        .getByRole('status')
        .filter({ hasText: t.askStopped })
        .getByRole('button', { name: t.retry, exact: true })
        .click();
      await complete();
      const samples = await samplesPromise;
      assert(samples.length > 3);
      assert(samples.every((sample) => prefixes.has(sample)));
      assert(samples.includes(answer));
      assert.equal(await paragraph().innerText(), answer);
      assert.equal(await page.locator('.ask-question').count(), 3);
      assert.equal(await input.inputValue(), '重试不要覆盖草稿');
      const evidence = page
        .locator('.ask-conversation .answer')
        .last()
        .locator('.evidence button')
        .first();
      await evidence.click();
      const preview = page.getByTestId('city-forecast');
      assert((await preview.innerText()).includes(requireValue(fixture.singleForecast).city.name));
      await preview.getByRole('button', { name: t.back, exact: true }).click();
      assert.equal(await paragraph().innerText(), answer);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await send('减少动画');
      await complete();
      assert.equal(await paragraph().innerText(), answer);
      assert.equal(requests, before + 5);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      if (width === 390 && locale === 'zh-Hans')
        await page.screenshot({
          path: new URL('./evidence/answer-reveal-mobile.png', import.meta.url).pathname,
        });
      rows.push({
        width,
        locale,
        progressive: true,
        firstLength: first.length,
        laterLength: later.length,
        frozenLength: frozen.length,
        fullLength: answer.length,
        observedUpdates: samples.length,
        graphemeSafe: true,
        freezeAfterNetworkFinished: true,
        historyFrozen: true,
        retry: true,
        draft: true,
        cityEvidence: true,
        reducedMotion: true,
        requests: 5,
      });
      await page.close();
    }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await writeFile(
    new URL('./evidence/answer-reveal-check.json', import.meta.url),
    JSON.stringify(
      { at: new Date().toISOString(), base, rows, requests, externalModelCalls: 0, errors },
      null,
      2,
    ),
  );
}
console.log(JSON.stringify({ passed: rows.length, requests, externalModelCalls: 0, errors }));
