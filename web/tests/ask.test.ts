import { jsonPath, textAt } from '../../qa/lib/json.ts';
import { parseJson } from '../lib/validation.ts';
import { requireValue } from '../lib/validation.ts';
import type { Forecast } from '../lib/types.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, modelPlan, rulePlan, validPlan, validateInput } from '../lib/ask.ts';
import { makeAskHandler, makeLimiter } from '../lib/ask-http.ts';

const start = Date.parse('2026-11-16T13:00:00Z') / 1000; // 22:00 in Seoul
const now = () => (start + 300) * 1000;
const weather: Forecast = {
  source: 'fixture',
  fetchedAt: new Date(now()).toISOString(),
  stale: false,
  version: 'fixture-id',
  timezone: 'Asia/Seoul',
  current: { time: start, temp: 15, code: 1 },
  hours: Array.from({ length: 24 }, (_, i) => ({
    time: start + i * 3600,
    temp: i === 4 ? 30 : 10 + i / 3,
    code: 2,
    rain: i === 10 ? 91 : 20,
  })),
  days: Array.from({ length: 7 }, (_, i) => ({
    date: '2026-11-' + (16 + i),
    min: 7 + i,
    max: 18 + i,
    code: 1,
  })),
};
const input = {
  question: 'Do I need an umbrella in the next 6 hours?',
  locale: 'en',
  lat: 37.57,
  lon: 126.98,
  version: weather.version,
};
const options = { getWeather: async () => weather, now };
const ask = (question: string, extra = {}, dependencies = {}) =>
  answerQuestion({ ...input, question, ...extra }, { ...options, ...dependencies });
const request = (body: {
  question?: string;
  locale?: string;
  lat?: number;
  lon?: number;
  version?: string;
}) =>
  new Request('http://localhost/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

test('rules preview evaluates 7–9 tomorrow using the selected city’s local date', async () => {
  const result = await ask('明早7–9点通勤需要带伞吗？', { locale: 'zh-Hans' });
  assert.equal(result.source, 'rules');
  assert.match(result.answer, /规则预览/);
  assert.equal(result.version, weather.version);
  assert.deepEqual(result.evidence, [
    { time: weather.hours[10].time, temp: weather.hours[10].temp, rain: 91 },
  ]);
});

test('Korean answer uses the same 07:00–09:00 window in Seoul and Korean UI copy', async () => {
  const result = await ask('내일 아침 7시부터 9시까지 우산이 필요할까요?', {
    locale: 'ko',
  });
  assert.match(result.answer, /규칙 기반/);
  assert.match(result.answer, /91%/);
  assert.equal(result.evidence[0].time, weather.hours[10].time);
});

test('the three quick questions are served in all four UI languages', async () => {
  const sets = [
    [
      'en',
      'Do I need an umbrella in the next 6 hours?',
      'When is the warmest hour today?',
      'What is the outlook for the next 7 days?',
    ],
    [
      'ko',
      '앞으로 6시간 동안 우산이 필요할까요?',
      '오늘 기온이 가장 높은 시간은 언제인가요?',
      '앞으로 7일 동안 날씨는 어떤가요?',
    ],
    ['zh-Hans', '未来 6 小时需要带伞吗？', '今天最暖和的是几点？', '未来 7 天天气如何？'],
    ['zh-Hant', '未來 6 小時需要帶傘嗎？', '今天最暖和的是幾點？', '未來 7 天天氣如何？'],
  ];
  for (const [locale, rain, warm, week] of sets) {
    assert.equal((await ask(rain, { locale })).evidence[0].rain, 20);
    assert.equal((await ask(warm, { locale })).evidence[0].time, weather.hours[1].time);
    assert.deepEqual((await ask(week, { locale })).dailyEvidence, weather.days);
  }
});

test('partially covered future days and dates after available daily coverage are declined', async () => {
  for (const q of [
    'Do I need an umbrella tomorrow evening?',
    'What is the weather for the next 10 days?',
    'What is the rain like next month?',
  ]) {
    assert.match((await ask(q)).answer, /does not cover/);
    assert.deepEqual((await ask(q)).evidence, []);
  }
});
test('localized daily evidence follows location midnight even while UTC is the prior day', async () => {
  const next = { now: () => Date.parse('2026-11-16T16:00:00Z') };
  assert.equal(
    requireValue((await ask('Weather today', {}, next)).dailyEvidence)[0].date,
    '2026-11-17',
  );
});

test('walking selects least rain then closest to 20°C, with exact evidence', async () => {
  const w = structuredClone(weather);
  w.hours[1] = { ...w.hours[1], rain: 0, temp: 31 };
  w.hours[2] = { ...w.hours[2], rain: 0, temp: 19 };
  const result = await ask(
    'Best time for a walk in the next 6 hours?',
    {},
    { getWeather: async () => w },
  );
  assert.equal(result.evidence[0].time, w.hours[2].time);
  assert.match(result.answer, /lowest rain chance/);
});

test('missing rain and interrupted hourly sequences are never interpolated or treated as zero', async () => {
  const w = structuredClone(weather);
  w.hours[1].rain = null;
  assert.match((await ask(input.question, {}, { getWeather: async () => w })).answer, /missing/);
  w.hours.splice(1, 1);
  assert.match(
    (await ask(input.question, {}, { getWeather: async () => w })).answer,
    /does not cover/,
  );
});

test('stale or inconsistent snapshots stop before a billable request', async () => {
  let calls = 0;
  const deps = {
    config: { apiKey: 'server-only' },
    transport: async () => {
      calls++;
    },
  };
  await assert.rejects(ask('rain?', { version: 'previous-version' }, deps), {
    code: 'STALE_FORECAST',
    status: 409,
  });
  await assert.rejects(
    ask('rain?', {}, { ...deps, getWeather: async () => ({ ...weather, stale: true }) }),
    { code: 'FORECAST_UNAVAILABLE', status: 503 },
  );
  assert.equal(calls, 0);
});

test('valid model plan is computed from app data only', async () => {
  const transport = async (
    url: unknown,
    init: { headers: { Authorization: unknown }; body: string },
  ) => {
    assert.equal(url, 'https://example.test/v1/chat/completions');
    assert.equal(init.headers.Authorization, 'Bearer test');
    const body = parseJson(init.body);
    assert.equal(jsonPath(body, 'response_format', 'type'), 'json_object');
    assert.match(textAt(body, 'messages', 0, 'content'), /2026-11-16.*Asia\/Seoul/);
    assert.equal(textAt(body, 'messages', 1, 'content'), 'I am going out with my dog. When?');
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'walk',
              window: 'next',
              hours: 6,
              answer: '999°C',
            }),
          },
        },
      ],
    });
  };
  const result = await ask(
    'I am going out with my dog. When?',
    {},
    {
      config: { apiKey: 'test', baseUrl: 'https://example.test/v1/' },
      transport,
    },
  );
  assert.equal(result.source, 'model');
  assert.doesNotMatch(result.answer, /999|Rules preview/);
  assert.equal(result.evidence.length, 1);
});
test('invalid planner response, provider timeout and HTTP error return explicit failures', async () => {
  const cases: [() => Response, string][] = [
    [
      () =>
        Response.json({
          choices: [
            {
              message: {
                content: '{"intent":"rain","window":"next","hours":-10}',
              },
            },
          ],
        }),
      'MODEL_UNAVAILABLE',
    ],
    [() => new Response('provider denied', { status: 403 }), 'MODEL_UNAVAILABLE'],
    [
      () => {
        throw new DOMException('timeout', 'TimeoutError');
      },
      'MODEL_TIMEOUT',
    ],
  ];
  for (const [response, expected] of cases) {
    await assert.rejects(
      modelPlan('hello', '2026-11-17', 'Asia/Seoul', { apiKey: 'test' }, response),
      { code: expected },
    );
  }
});

test('validates locale, version, request length, bounds and ambiguous dates', () => {
  for (const change of [
    { lat: 91 },
    { lon: '0' },
    { locale: '__proto__' },
    { locale: ['en'] },
    { version: '' },
    { question: 'x'.repeat(501) },
  ]) {
    assert.throws(() => validateInput({ ...input, ...change }), {
      status: 400,
    });
  }
  assert.equal(
    validPlan({
      intent: 'rain',
      window: 'local',
      startDay: 0,
      dayCount: 1,
      fromHour: 9,
      toHour: 7,
    }),
    false,
  );
  assert.equal(rulePlan('How do I reset a password?', '2026-11-16').intent, 'unsupported');
});

test('HTTP rate limit spans clients in one process and expires by time', async () => {
  let time = 0;
  const handler = makeAskHandler(
    options,
    makeLimiter({ limit: 1, interval: 1000, now: () => time }),
  );
  assert.equal((await handler(request(input))).status, 200);
  const limited = await handler(request(input));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  time = 1000;
  assert.equal((await handler(request(input))).status, 200);
});

test('HTTP malformed and oversize bodies fail before weather/model access', async () => {
  const handler = makeAskHandler({
    getWeather: () => assert.fail('unexpected weather access'),
  });
  assert.equal((await handler(request({ question: 'x'.repeat(9000) }))).status, 413);
  const plain = new Request('http://localhost/api/ask', {
    method: 'POST',
    body: 'text',
  });
  assert.equal((await handler(plain)).status, 415);
  assert.equal((await handler(request({}))).status, 400);
});

test('explicit ISO date is interpreted as a date, not a hyphenated hour range', async () => {
  const result = await ask('Will it rain on 2026-11-17 in the morning?');
  assert.match(result.answer, /91%/);
  assert.equal(result.evidence[0].time, weather.hours[10].time);
});

test('both occurrences of the autumn clock change are available for the same local hour', async () => {
  const t = Date.parse('2026-11-01T04:00:00Z') / 1000;
  const w = {
    ...weather,
    timezone: 'America/New_York',
    hours: Array.from({ length: 24 }, (_, i) => ({
      time: t + i * 3600,
      temp: 17,
      code: 0,
      rain: i === 2 ? 88 : 1,
    })),
  };
  const result = await ask(
    'rain today 1–1 am?',
    {},
    { getWeather: async () => w, now: () => t * 1000 },
  );
  assert.equal(result.evidence[0].time, t + 2 * 3600);
  assert.equal(result.evidence[0].rain, 88);
});
