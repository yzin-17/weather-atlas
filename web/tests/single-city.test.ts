import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, AskError } from '../lib/ask.ts';
import { createWeatherService } from '../lib/weather.ts';
import { validAskResult } from '../lib/contracts.ts';
import type { AskResult, Locale, Plan, SingleContext, Place } from '../lib/types.ts';

const guangzhou: Place = { id: 1809858, name: '广州', country: '中国', lat: 23.1167, lon: 113.25 };
const origin = { lat: 37.566, lon: 126.9784 };
const initialTime = Date.parse('2026-11-17T03:00Z');
function setup() {
  let tick = initialTime;
  const baseService = createWeatherService({ demo: true, clock: () => tick });
  const service = {
    ...baseService,
    getWeather: async (lat: number, lon: number) => {
      const forecast = await baseService.getWeather(lat, lon);
      return lat === guangzhou.lat && lon === guangzhou.lon
        ? { ...forecast, timezone: 'Asia/Shanghai' }
        : forecast;
    },
  };
  const searches: string[] = [];
  const searchPlaces = async (query: string) => {
    searches.push(query);
    return { places: query === '广州' || query === 'Guangzhou' ? [guangzhou] : [] };
  };
  const ask = async (
    question: string,
    singleContext?: SingleContext,
    plan?: Plan & { cityQuery?: string },
    extra = {},
  ) => {
    const forecast = await service.getWeather(origin.lat, origin.lon);
    return answerQuestion(
      { question, locale: 'zh-Hans', ...origin, version: forecast.version, singleContext },
      {
        getWeather: service.getWeather,
        searchPlaces,
        now: () => tick,
        ...(plan
          ? {
              config: { apiKey: 'fixture', model: 'gpt-6-luna' },
              transport: async () =>
                Response.json({ choices: [{ message: { content: JSON.stringify(plan) } }] }),
            }
          : {}),
        ...extra,
      },
    );
  };
  return {
    service,
    ask,
    searches,
    advance: (ms: number) => {
      tick += ms;
    },
  };
}

for (const model of [false, true])
  test(`${model ? '模型' : '规则'}：广州单城多轮保留城市、日期和依据`, async () => {
    const { ask, searches } = setup();
    const first = await ask(
      '今天广州天气怎样',
      undefined,
      model
        ? { intent: 'daily', window: 'days', startDay: 0, dayCount: 1, cityQuery: '广州' }
        : undefined,
    );
    assert(validAskResult(first));
    assert(first.answer.includes('广州 · Asia/Shanghai'));
    assert.equal(first.singleContext?.city.id, guangzhou.id);
    assert.equal(first.dailyEvidence?.[0].date, '2026-11-17');
    assert.equal(first.singleForecast?.forecast.version, first.singleContext?.city.version);
    const second = await ask(
      '明天呢',
      first.singleContext,
      model ? { intent: 'daily', window: 'days', startDay: 1, dayCount: 1 } : undefined,
    );
    assert.equal(second.dailyEvidence?.[0].date, '2026-11-18');
    // 保留真实验收出现过的错误：模型遗漏下午，服务端仍按明确时段校正。
    const third = await ask(
      '那下午呢',
      second.singleContext,
      model ? { intent: 'daily', window: 'days', startDay: 1, dayCount: 1 } : undefined,
    );
    assert(third.evidence.length > 0);
    for (const entry of third.evidence) {
      assert.equal(entry.city?.id, guangzhou.id);
      assert.equal(entry.timezone, 'Asia/Shanghai');
      assert.equal(entry.version, third.singleForecast?.forecast.version);
      const matching = third.singleForecast?.forecast.comparisonHours?.find(
        (hour) => hour.time === entry.time,
      );
      assert.equal(entry.temp, matching?.temp);
    }
    const fourth = await ask(
      '会下雨吗',
      third.singleContext,
      model ? { intent: 'rain', window: 'next', hours: 6 } : undefined,
    );
    assert.equal(fourth.singleContext?.plan.window, 'local');
    if (fourth.singleContext?.plan.window === 'local') {
      assert.equal(fourth.singleContext.plan.startDay, 1);
      assert.equal(fourth.singleContext.plan.fromHour, 12);
    }
    assert.equal(fourth.singleContext?.plan.intent, 'rain');
    assert(validAskResult(fourth));
    const nextSix = await ask(
      '未来6小时会下雨吗',
      fourth.singleContext,
      model ? { intent: 'rain', window: 'next', hours: 6 } : undefined,
    );
    assert.equal(nextSix.singleContext?.plan.window, 'next');
    assert(searches.length >= 4);
  });

test('全球单城四语回答与显式换城、返回当前地点', async () => {
  const { service } = setup();
  const forecast = await service.getWeather(origin.lat, origin.lon);
  for (const locale of ['zh-Hans', 'zh-Hant', 'en', 'ko'] satisfies Locale[]) {
    const result = await answerQuestion(
      { question: 'weather in Guangzhou today', locale, ...origin, version: forecast.version },
      {
        getWeather: service.getWeather,
        searchPlaces: async () => ({ places: [guangzhou] }),
        now: () => initialTime,
      },
    );
    assert(validAskResult(result));
    assert.equal(result.singleContext?.city.id, guangzhou.id);
    assert.equal(result.source, 'rules');
  }
  const { ask } = setup();
  const first = await ask('今天广州天气怎样');
  const second = await ask('今天台北天气怎样', first.singleContext);
  assert.equal(second.singleContext?.city.id, 1668341);
  assert.equal(second.singleForecast?.forecast.timezone, 'Asia/Taipei');
  const current = await ask('当前地点天气怎样', second.singleContext);
  assert.equal(current.singleContext, undefined);
  assert.equal(current.singleForecast, undefined);
});

test('单城未知、同名歧义与伪造上下文都不猜测城市', async () => {
  const { ask } = setup();
  await assert.rejects(
    ask('今天未知之城天气怎样'),
    (e) => e instanceof AskError && e.code === 'CITY_NOT_FOUND',
  );
  await assert.rejects(
    ask('weather in Paris today', undefined, undefined, {
      searchPlaces: async () => ({
        places: [
          { ...guangzhou, name: 'Paris' },
          { ...guangzhou, id: 2, lat: 48.85, name: 'Paris' },
        ],
      }),
    }),
    (e) => e instanceof AskError && e.code === 'AMBIGUOUS_CITY',
  );
  const first = await ask('今天广州天气怎样');
  assert(first.singleContext);
  const forged = { ...first.singleContext, city: { ...first.singleContext.city, lat: 45 } };
  await assert.rejects(ask('明天呢', forged), (e) => e instanceof AskError && e.status === 400);
});

test('过期目标版本返回 409，页面变更不沿用原城市', async () => {
  const { ask, service } = setup();
  const first = await ask('今天广州天气怎样');
  assert(first.singleContext);
  const expired = { ...first.singleContext, city: { ...first.singleContext.city, version: 'old' } };
  await assert.rejects(ask('明天呢', expired), (e) => e instanceof AskError && e.status === 409);
  let calls = 0;
  await assert.rejects(
    ask(
      '明天呢',
      expired,
      { intent: 'daily', window: 'days', startDay: 1, dayCount: 1 },
      {
        transport: async () => {
          calls++;
          throw Error('不应调用模型');
        },
      },
    ),
    (e) => e instanceof AskError && e.status === 409,
  );
  assert.equal(calls, 0);
  const changedOrigin = { ...first.singleContext, origin: '0,0' };
  const current = await ask('今天天气怎样', changedOrigin);
  assert.equal(current.singleForecast, undefined);
  await assert.rejects(
    ask('明天呢', first.singleContext, undefined, {
      getWeather: async (lat: number, lon: number) => ({
        ...(await service.getWeather(lat, lon)),
        stale: lat === guangzhou.lat,
      }),
    }),
    (e) => e instanceof AskError && e.status === 503,
  );
});

test('单城缺失降水不视作零概率，上下文的时区不能覆盖天气快照', async () => {
  const { ask, service } = setup();
  const first = await ask('今天广州天气怎样');
  assert(first.singleContext);
  const context = {
    ...first.singleContext,
    city: { ...first.singleContext.city, timezone: 'Invalid/Zone' },
  };
  const follow = await ask('明天呢', context);
  assert.equal(follow.singleForecast?.forecast.timezone, 'Asia/Shanghai');
  const missing = await ask(
    '广州明天下雨吗',
    undefined,
    {
      cityQuery: '广州',
      intent: 'rain',
      window: 'local',
      startDay: 1,
      dayCount: 1,
      fromHour: 12,
      toHour: 17,
    },
    {
      getWeather: async (lat: number, lon: number) => {
        const weather = await service.getWeather(lat, lon);
        return lat === guangzhou.lat
          ? {
              ...weather,
              comparisonHours: weather.comparisonHours?.map((hour) => ({ ...hour, rain: null })),
            }
          : weather;
      },
    },
  );
  assert.equal(missing.evidence.length, 0);
  assert(!missing.answer.includes('0%'));
});

test('目的地跨午夜追问保持原当地日期，城市时区由天气快照确定', async () => {
  const { ask, advance, service } = setup();
  const first = await ask('今天广州天气怎样');
  assert(first.singleContext);
  advance(14 * 3600000);
  const fresh = await service.getWeather(guangzhou.lat, guangzhou.lon);
  const context = {
    ...first.singleContext,
    createdAt: initialTime + 14 * 3600000,
    city: { ...first.singleContext.city, version: fresh.version },
  };
  const follow = await ask('那下午呢', context, {
    intent: 'temperature',
    window: 'local',
    startDay: 0,
    dayCount: 1,
    fromHour: 12,
    toHour: 17,
  });
  assert.equal(follow.singleContext?.plan.window, 'local');
  if (follow.singleContext?.plan.window === 'local')
    assert.equal(follow.singleContext.plan.startDay, -1);
  assert.equal(follow.evidence.length, 0);
});
