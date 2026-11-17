import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, copyFor, rulePlan, validPlan } from '../lib/ask.ts';
import { createWeatherService } from '../lib/weather.ts';
import { validAskResult, validSingleContext } from '../lib/contracts.ts';
import { condition } from '../lib/ui-text.ts';
import { requireValue } from '../lib/validation.ts';
import type { AdviceIntent, Forecast, Locale, Place, Plan, SingleContext } from '../lib/types.ts';

const now = Date.parse('2026-11-17T03:00:00Z');
const origin = { lat: 37.566, lon: 126.9784 };
const city: Place = { id: 1809858, lat: 23.1167, lon: 113.25, name: '广州', country: '中国' };
const phrases: Record<Locale, [string, string, string, string, string]> = {
  'zh-Hans': ['出门穿什么衣服', '适合跑步吗', '能晾衣服吗', '需要防晒吗', '明天会下雪吗'],
  'zh-Hant': ['出門穿什麼衣服', '適合騎車嗎', '可以晾衣服嗎', '需要防曬嗎', '明天有雷雨嗎'],
  en: [
    'What should I wear?',
    'Is outdoor running suitable?',
    'Can I dry laundry?',
    'Do I need sunscreen?',
    'Will there be snow tomorrow?',
  ],
  ko: [
    '무슨 옷을 입을까요?',
    '야외 달리기 괜찮을까요?',
    '빨래를 널어도 되나요?',
    '선크림이 필요할까요?',
    '내일 눈이 올까요?',
  ],
};

for (const locale of Object.keys(phrases).filter((key): key is Locale => key in phrases))
  test(`新增意图四语规则：${locale}`, () => {
    const intents: AdviceIntent[] = ['clothing', 'outdoor', 'laundry', 'sun', 'conditions'];
    phrases[locale].forEach((phrase, index) => {
      const plan = rulePlan(phrase, '2026-11-17');
      assert.equal(plan.intent, intents[index]);
      assert(validPlan(plan));
    });
    assert.equal(rulePlan('Sunday weather forecast', '2026-11-17').intent, 'daily');
    assert.equal(rulePlan('What is the humidity?', '2026-11-17').intent, 'unsupported');
  });

async function fixture() {
  const service = createWeatherService({ demo: true, clock: () => now });
  const first = await service.getWeather(origin.lat, origin.lon);
  const target = { ...(await service.getWeather(city.lat, city.lon)), timezone: 'Asia/Shanghai' };
  return { first, target };
}

test('每日概述包含天气现象，当前天气现象可追溯到当前读数', async () => {
  const { target } = await fixture();
  for (const locale of ['zh-Hans', 'zh-Hant', 'en', 'ko'] satisfies Locale[]) {
    const daily = copyFor(
      { intent: 'daily', window: 'days', startDay: 0, dayCount: 1 },
      target,
      locale,
      now / 1000,
    );
    assert(daily.answer.includes(condition(target.days[0].code, locale)));
    assert.deepEqual(daily.dailyEvidence, [target.days[0]]);
    const current = copyFor({ intent: 'conditions', window: 'now' }, target, locale, now / 1000);
    assert(current.answer.includes(condition(target.current.code, locale)));
    assert.equal(current.evidence[0].code, target.current.code);
  }
});

test('穿衣依据包含温度极值、降水峰值及天气现象；缺测不变为零', async () => {
  const { target } = await fixture();
  const hours = requireValue(target.comparisonHours).map((hour, i) => ({
    ...hour,
    temp: i === 0 ? 3 : 18,
    rain: i === 1 ? 90 : 0,
    code: i === 1 ? 95 : 0,
  }));
  const weather: Forecast = { ...target, hours: hours.slice(0, 24), comparisonHours: hours };
  const result = copyFor(
    { intent: 'clothing', window: 'next', hours: 6 },
    weather,
    'zh-Hans',
    now / 1000,
  );
  assert(result.answer.includes('厚外套'));
  assert(result.answer.includes('备伞'));
  assert(result.answer.includes('90%'));
  assert(result.evidence.some((entry) => entry.temp === 3));
  assert(result.evidence.some((entry) => entry.rain === 90 && entry.code === 95));
  for (const intent of ['outdoor', 'laundry', 'sun'] satisfies AdviceIntent[]) {
    const missing = copyFor(
      { intent, window: 'next', hours: 6 },
      { ...weather, hours: weather.hours.map((hour) => ({ ...hour, code: 0, rain: null })) },
      'zh-Hans',
      now / 1000,
    );
    assert(missing.answer.includes('降水概率缺失'));
    assert(!missing.answer.includes('0%'));
    assert(!missing.answer.includes('可考虑一般户外'));
    if (intent === 'laundry') assert(!missing.answer.includes('可考虑室外晾晒'));
    if (intent === 'sun') assert(missing.answer.includes('未包含紫外线指数'));
  }
  const storm = copyFor(
    { intent: 'outdoor', window: 'next', hours: 6 },
    weather,
    'zh-Hans',
    now / 1000,
  );
  assert(storm.answer.includes('优先室内'));
});

for (const model of [false, true])
  test(`${model ? '模型' : '规则'}广州天气 → 穿衣 → 明天 → 下午 → 户外，继承城市日期和时段`, async () => {
    const { first, target } = await fixture();
    let calls = 0,
      context: SingleContext | undefined;
    async function ask(question: string, plan?: Plan & { cityQuery?: string }) {
      const result = await answerQuestion(
        { ...origin, question, locale: 'zh-Hans', version: first.version, singleContext: context },
        {
          getWeather: async (lat) => (lat === city.lat ? target : first),
          searchPlaces: async () => ({ places: [city] }),
          now: () => now,
          ...(model
            ? {
                config: { apiKey: 'fixture' },
                transport: async () => {
                  calls++;
                  return Response.json({
                    choices: [{ message: { content: JSON.stringify(plan) } }],
                  });
                },
              }
            : {}),
        },
      );
      assert(validAskResult(result));
      assert(validSingleContext(result.singleContext));
      context = result.singleContext;
      assert.equal(context.city.id, city.id);
      assert.equal(result.singleForecast?.forecast.timezone, 'Asia/Shanghai');
      for (const evidence of result.evidence) {
        const hour = requireValue(target.comparisonHours).find(
          (hour) => hour.time === evidence.time,
        );
        assert(hour);
        assert.equal(evidence.temp, hour.temp);
        assert.equal(evidence.rain, hour.rain);
        assert.equal(evidence.code, hour.code);
        assert.equal(evidence.version, target.version);
      }
      return result;
    }
    await ask('今天广州天气怎样', {
      intent: 'daily',
      window: 'days',
      startDay: 0,
      dayCount: 1,
      cityQuery: '广州',
    });
    const clothing = await ask('出门穿什么衣服', { intent: 'clothing', window: 'next', hours: 6 });
    assert.equal(clothing.singleContext?.plan.intent, 'clothing');
    assert.equal(clothing.singleContext?.plan.window, 'local');
    assert(clothing.answer.includes('建议') || clothing.answer.includes('可考虑'));
    const tomorrow = await ask('明天呢', {
      intent: 'clothing',
      window: 'local',
      startDay: 1,
      dayCount: 1,
      fromHour: 0,
      toHour: 23,
    });
    assert.equal(tomorrow.singleContext?.plan.window, 'local');
    const afternoon = await ask('那下午呢', {
      intent: 'clothing',
      window: 'local',
      startDay: 1,
      dayCount: 1,
      fromHour: 0,
      toHour: 23,
    });
    assert.equal(afternoon.singleContext?.plan.intent, 'clothing');
    assert.equal(
      afternoon.singleContext?.plan.window === 'local' && afternoon.singleContext.plan.fromHour,
      12,
    );
    const outdoor = await ask('适合跑步吗', { intent: 'outdoor', window: 'next', hours: 6 });
    assert.equal(
      outdoor.singleContext?.plan.window === 'local' && outdoor.singleContext.plan.startDay,
      1,
    );
    assert.equal(
      outdoor.singleContext?.plan.window === 'local' && outdoor.singleContext.plan.fromHour,
      12,
    );
    for (const [question, intent] of [
      ['需要防晒吗', 'sun'],
      ['可以晾衣服吗', 'laundry'],
      ['会下雪吗', 'conditions'],
    ] satisfies [string, AdviceIntent][]) {
      const advice = await ask(question, { intent, window: 'next', hours: 6 });
      assert.equal(advice.singleContext?.plan.intent, intent);
      assert.equal(advice.singleContext?.city.id, city.id);
    }
    assert.equal(calls, model ? 8 : 0);
  });

test('新增意图仍校验时间窗口，不接受生活建议的伪造日期窗口', () => {
  assert(!validPlan({ intent: 'clothing', window: 'days', startDay: 0, dayCount: 1 }));
  assert(
    !validPlan({
      intent: 'outdoor',
      window: 'local',
      startDay: 0,
      dayCount: 1,
      fromHour: 23,
      toHour: 2,
    }),
  );
  assert(validPlan({ intent: 'conditions', window: 'now' }));
});

test('天气现象明确区分预报有雪／雷雨、未显示与未知', async () => {
  const { target } = await fixture();
  for (const [code, expected] of [
    [0, '未显示降雪'],
    [75, '预报有降雪'],
    [95, '预报有雷雨'],
    [10, '天气现象未知'],
  ] satisfies [number, string][]) {
    const weather = { ...target, hours: target.hours.map((hour) => ({ ...hour, code })) };
    const result = copyFor(
      { intent: 'conditions', window: 'next', hours: 6 },
      weather,
      'zh-Hans',
      now / 1000,
    );
    assert(result.answer.includes(expected));
    assert(!result.answer.includes('降雪概率 0'));
  }
});

test('明确地区的同名城市按上游字段消歧，不静默选第一个结果', async () => {
  const { first, target } = await fixture();
  const result = await answerQuestion(
    {
      ...origin,
      question: 'weather in Guangzhou, Guangdong, China today',
      locale: 'en',
      version: first.version,
    },
    {
      getWeather: async (lat) => (lat === city.lat ? target : first),
      searchPlaces: async (query) => {
        assert.equal(query, 'Guangzhou');
        return {
          places: [
            { ...city, id: 2, name: 'Guangzhou', region: 'Jiangxi' },
            { ...city, name: 'Guangzhou', region: 'Guangdong', country: 'China' },
          ],
        };
      },
      now: () => now,
    },
  );
  assert.equal(result.singleContext?.city.id, city.id);
  assert.equal(result.singleContext.city.lookup, 'Guangzhou, Guangdong, China');
});
