import { readForecast, readComparison } from './lib/json.ts';
import { requireValue } from '../web/lib/validation.ts';
import type { ComparisonContext } from '../web/lib/types.ts';
import type { ComparisonAnswer } from './lib/contracts.ts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const origin = process.env.APP_URL || 'http://127.0.0.1:3305',
  rows: {
    locale: string;
    turn: number;
    status: unknown;
    ms: number;
    source: unknown;
    code: unknown;
    answer: unknown;
    context: unknown;
    comparisons: unknown;
  }[] = [];
const forecast = await fetch(origin + '/api/weather?lat=37.566&lon=126.9784').then((r) =>
  readForecast(r),
);
const questions = {
  'zh-Hans': ['首尔和台北明天早上 7–9 点，哪里更容易下雨？', '那下午呢？', '哪个更冷？'],
  'zh-Hant': ['首爾和臺北明天早上 7–9 點，哪裡更容易下雨？', '那下午呢？', '哪個更冷？'],
  en: [
    'Seoul and Taipei tomorrow morning 7–9, which has a higher chance of rain?',
    'What about the afternoon?',
    'Which is colder?',
  ],
  ko: [
    '서울과 타이베이의 내일 오전 7–9시 중 어디에 비가 올 가능성이 더 높나요?',
    '그럼 오후에는요?',
    '어느 곳이 더 추워요?',
  ],
};
try {
  for (const [locale, list] of Object.entries(questions)) {
    let context: ComparisonContext | undefined;
    for (let turn = 0; turn < list.length; turn++) {
      const start = performance.now(),
        r: Response = await fetch(origin + '/api/ask', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            lat: 37.566,
            lon: 126.9784,
            version: forecast.version,
            locale,
            question: list[turn],
            context,
          }),
        }),
        body: ComparisonAnswer = await readComparison(r);
      rows.push({
        locale,
        turn: turn + 1,
        status: r.status,
        ms: Math.round(performance.now() - start),
        source: body.source,
        code: body.code,
        answer: body.answer,
        context: body.context,
        comparisons: body.comparisons,
      });
      assert.equal(r.status, 200, body.code || '');
      assert.equal(body.source, 'model');
      assert.equal(body.comparisons.length, 2);
      if (turn === 0) assert(body.comparisons.every((c) => c.evidence.length === 3));
      if (turn > 0) assert(body.comparisons.every((c) => c.evidence.length === 6));
      for (const city of body.comparisons)
        for (const e of city.evidence) {
          assert.equal(e.version, city.version);
          assert.equal(e.timezone, city.timezone);
          assert(
            requireValue(requireValue(city.forecast).comparisonHours).some(
              (h) => h.time === e.time && h.temp === e.temp && h.rain === e.rain,
            ),
          );
        }
      context = body.context;
    }
  }
} finally {
  await writeFile(
    new URL('./evidence/real-model.json', import.meta.url),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        configuredModel: 'gpt-4.1-mini',
        weather: 'controlled fixture, not real upstream weather',
        calls: rows.length,
        rows,
      },
      null,
      2,
    ),
  );
}
console.log(
  JSON.stringify(
    rows.map(({ locale, turn, status, ms, source }) => ({ locale, turn, status, ms, source })),
  ),
);
