import { jsonPath, textAt, readObject } from '../../qa/lib/json.ts';
import { parseJson } from '../lib/validation.ts';
import { requireValue } from '../lib/validation.ts';
import type { ComparisonContext, Forecast } from '../lib/types.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, utimes } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createSharedStore, sharedLimiter } from '../lib/shared-store.ts';
import { createWeatherService, normalizeWeather } from '../lib/weather.ts';
import { answerQuestion } from '../lib/ask.ts';
import { catalog } from '../lib/catalog.ts';
import { validateMetric, summarizeMetrics } from '../lib/rum.ts';
import { WeatherError } from '../lib/weather.ts';
import { isWeatherError } from '../lib/service-errors.ts';
import { respond } from '../lib/http.ts';
import { isRecord, isFiniteNumber, timed } from '../lib/validation.ts';

const time = Date.parse('2026-11-16T00:00Z'),
  now = () => time;
const seoul = catalog[0],
  taipei = catalog[2];
const service = createWeatherService({ demo: true, clock: now });
async function input(question: string, extra = {}) {
  return {
    question,
    locale: 'zh-Hans',
    lat: seoul.lat,
    lon: seoul.lon,
    version: (await service.getWeather(seoul.lat, seoul.lon)).version,
    ...extra,
  };
}
const options = { getWeather: service.getWeather, now };
test('abandoned shared-cache lease is recovered', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'atlas-lease-'));
  try {
    const target = path.join(dir, createHash('sha256').update('lock:dead').digest('hex') + '.lock');
    await mkdir(target);
    const old = new Date(Date.now() - 120000);
    await utimes(target, old, old);
    const value = await createSharedStore(dir).lock('dead', async () => 42);
    assert.equal(value, 42);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('weather errors from another SSR/API module copy retain their HTTP status', async () => {
  const other: unknown = await import('../lib/service-errors.ts' + '?separate-module-copy');
  assert(isRecord(other) && typeof other.WeatherError === 'function');
  const error: unknown = Reflect.construct(other.WeatherError, [
    503,
    'UPSTREAM_UNAVAILABLE',
    'Unavailable',
  ]);
  assert.equal(error instanceof WeatherError, false);
  assert(isWeatherError(error));
  const response = await respond(() => {
    throw error;
  });
  assert.equal(response.status, 503);
  assert.equal((await readObject(response)).code, 'UPSTREAM_UNAVAILABLE');
});

test('comparison three turns retain cities/date/metric and every value has city snapshot evidence', async () => {
  const first = await answerQuestion(
    await input('首尔和台北明天早上 7–9 点，哪里更容易下雨？'),
    options,
  );
  assert.equal(requireValue(first.comparisons).length, 2);
  assert.deepEqual(
    requireValue(first.comparisons).map((r) => [r.date, r.fromHour, r.toHour, r.complete]),
    [
      ['2026-11-17', 7, 9, true],
      ['2026-11-17', 7, 9, true],
    ],
  );
  assert.notEqual(
    requireValue(first.comparisons)[0].evidence[0].time,
    requireValue(first.comparisons)[1].evidence[0].time,
  );
  const second = await answerQuestion(
    await input('那下午呢？', { context: first.context }),
    options,
  );
  assert.deepEqual(requireValue(second.context).plan, {
    intent: 'rain',
    window: 'local',
    startDay: 1,
    dayCount: 1,
    fromHour: 12,
    toHour: 17,
  });
  const third = await answerQuestion(
    await input('哪个更冷？', { context: second.context }),
    options,
  );
  assert.equal(requireValue(third.context).plan.intent, 'temperature');
  assert.equal(requireValue(third.context).plan.fromHour, 12);
  for (const r of requireValue(third.comparisons)) {
    assert.equal(r.value, Math.min(...r.evidence.map((h) => requireValue(h.temp))));
    for (const h of r.evidence)
      assert(
        requireValue(requireValue(r.forecast).comparisonHours).some(
          (x) => x.time === h.time && x.temp === h.temp && x.rain === h.rain,
        ),
      );
    assert(
      r.evidence.every((h) => h.version === r.version && requireValue(h.city).lat === r.city.lat),
    );
  }
});
test('comparison is localized in all four languages', async () => {
  for (const locale of ['zh-Hans', 'zh-Hant', 'en', 'ko']) {
    const r = await answerQuestion(
      await input('Seoul and Taipei tomorrow morning 7–9 rain comparison', { locale }),
      options,
    );
    assert.equal(requireValue(r.comparisons).length, 2);
    assert(requireValue(r.comparisons).every((c) => c.complete));
    assert.equal(r.source, 'rules');
    assert(!r.answer.includes('undefined'));
  }
});
test('a healthy refresh of an expired comparison city is awaited instead of reporting missing readings', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'atlas-ai-fresh-'));
  let tick = time;
  const clock = () => tick;
  const shared = createSharedStore(directory, clock),
    weather = createWeatherService({ demo: true, clock, sharedStore: shared });
  try {
    await weather.getWeather(taipei.lat, taipei.lon);
    tick += 16 * 60000;
    const current = await weather.getWeather(seoul.lat, seoul.lon);
    const result = await answerQuestion(
      {
        question: '首尔和台北明天7–9下雨比较',
        locale: 'zh-Hans',
        lat: seoul.lat,
        lon: seoul.lon,
        version: current.version,
      },
      { getWeather: weather.getWeather, now: clock },
    );
    assert(requireValue(result.comparisons).every((c) => c.complete));
    assert.equal(
      requireValue(requireValue(result.comparisons).find((c) => c.city.id === taipei.id)).fetchedAt,
      new Date(tick).toISOString(),
    );
  } finally {
    for (let i = 0; i < 100; i++) {
      const entry = await shared.read(`forecast-v3:demo:${taipei.lat},${taipei.lon}`, timed);
      if (entry?.at === tick) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    await rm(directory, { recursive: true, force: true });
  }
});
test('follow-ups preserve the original city dates across midnight and explicit dates reset the anchor', async () => {
  let tick = Date.parse('2026-11-16T14:59:00Z');
  const clock = () => tick;
  const weather = createWeatherService({ demo: true, clock });
  const settings = { getWeather: weather.getWeather, now: clock };
  const ask = async (question: string, context: ComparisonContext | undefined = undefined) =>
    answerQuestion(
      {
        question,
        context,
        locale: 'zh-Hans',
        lat: seoul.lat,
        lon: seoul.lon,
        version: (await weather.getWeather(seoul.lat, seoul.lon)).version,
      },
      settings,
    );
  const first = await ask('首尔和台北明天7–9下雨比较');
  assert.deepEqual(
    requireValue(first.comparisons).map((c) => c.date),
    ['2026-11-17', '2026-11-17'],
  );
  tick = Date.parse('2026-11-16T15:01:00Z');
  const afternoon = await ask('那下午呢？', first.context);
  assert.deepEqual(
    requireValue(afternoon.comparisons).map((c) => c.date),
    ['2026-11-17', '2026-11-17'],
  );
  const today = await ask('改成今天下午呢？', afternoon.context);
  assert.deepEqual(
    requireValue(today.comparisons).map((c) => c.date),
    ['2026-11-17', '2026-11-16'],
  );
  const colder = await ask('哪个更冷？', today.context);
  assert.deepEqual(
    requireValue(colder.comparisons).map((c) => c.date),
    ['2026-11-17', '2026-11-16'],
  );
  assert.equal(requireValue(colder.context).dateAnchor, tick);
});
test('same absolute time uses explicitly requested IANA timezone', async () => {
  const r = await answerQuestion(
    await input('比较首尔和台北明天 7–9 降水，同一绝对时刻 Asia/Seoul'),
    options,
  );
  assert.equal(requireValue(r.context).alignmentZone, 'Asia/Seoul');
  assert.deepEqual(
    requireValue(r.comparisons)[0].evidence.map((h) => h.time),
    requireValue(r.comparisons)[1].evidence.map((h) => h.time),
  );
});
test('server rejects a model-invented alignment zone without an explicit user timezone', async () => {
  const r = await answerQuestion(await input('首尔和台北明天 7–9 下雨，同一绝对时刻'), {
    ...options,
    config: { apiKey: 'fixture' },
    transport: async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                cityQueries: ['Seoul', 'Taipei'],
                plan: {
                  intent: 'rain',
                  window: 'local',
                  startDay: 1,
                  dayCount: 1,
                  fromHour: 7,
                  toHour: 9,
                },
                alignmentZone: 'UTC',
              }),
            },
          },
        ],
      }),
  });
  assert.equal(r.context, undefined);
  assert.equal(r.comparisons, undefined);
});
test('one missing rain value prevents comparison and is never treated as zero', async () => {
  const r = await answerQuestion(await input('首尔和台北明天 7–9 下雨比较'), {
    ...options,
    getWeather: async (lat: unknown, lon: unknown) => {
      const f = structuredClone(await service.getWeather(lat, lon));
      if (lat === taipei.lat)
        f.comparisonHours = requireValue(f.comparisonHours).map((h) => ({ ...h, rain: null }));
      return f;
    },
  });
  assert.equal(requireValue(r.comparisons)[1].value, null);
  assert.equal(requireValue(r.comparisons)[1].complete, false);
  assert.match(r.answer, /无法比较/);
});
test('changed comparison version returns 409 before a model call; changing origin drops context', async () => {
  const first = await answerQuestion(await input('首尔和台北明天 7–9 下雨比较'), options);
  await assert.rejects(
    answerQuestion(await input('那下午呢？', { context: first.context }), {
      ...options,
      getWeather: async (lat: unknown, lon: unknown) => {
        const f = await service.getWeather(lat, lon);
        return lat === taipei.lat ? { ...f, version: 'new' } : f;
      },
    }),
    { status: 409 },
  );
  const london = catalog[3],
    f = await service.getWeather(london.lat, london.lon);
  const r = await answerQuestion(
    {
      question: '那下午呢？',
      locale: 'zh-Hans',
      lat: london.lat,
      lon: london.lon,
      version: f.version,
      context: first.context,
    },
    options,
  );
  assert.equal(r.context, undefined);
  assert.equal(r.version, f.version);
});
test('model extracts comparison intent but readings are computed on the server', async () => {
  let calls = 0;
  const r = await answerQuestion(await input('首尔和台北明天 7–9 下雨比较'), {
    ...options,
    config: { apiKey: 'fixture', model: 'intent-fixture' },
    transport: async (_url, init: { body: string }) => {
      calls++;
      const request = parseJson(init.body);
      assert(textAt(request, 'messages', 0, 'content').includes('Never provide weather facts'));
      assert.equal(jsonPath(request, 'response_format', 'type'), 'json_schema');
      assert.equal(jsonPath(request, 'response_format', 'json_schema', 'strict'), true);
      assert.deepEqual(
        jsonPath(
          request,
          'response_format',
          'json_schema',
          'schema',
          'properties',
          'plan',
          'properties',
          'window',
          'enum',
        ),
        ['local'],
      );
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                cityQueries: ['Seoul', 'Taipei'],
                plan: {
                  intent: 'rain',
                  window: 'local',
                  startDay: 1,
                  dayCount: 1,
                  fromHour: 7,
                  toHour: 9,
                },
                alignmentZone: null,
              }),
            },
          },
        ],
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(r.source, 'model');
  assert.equal(r.model, 'intent-fixture');
  assert(requireValue(r.comparisons).every((c) => c.complete));
});
test('follow-up city labels and coordinates are revalidated before model extraction', async () => {
  const first = await answerQuestion(await input('首尔和台北明天7–9下雨比较'), options);
  const changed = structuredClone(first.context);
  requireValue(changed).cities[0].name = 'False city';
  requireValue(changed).cities[0].country = 'False country';
  const r = await answerQuestion(await input('那下午呢？', { context: changed }), options);
  assert.equal(
    requireValue(r.comparisons)[0].city.name,
    requireValue(first.comparisons)[0].city.name,
  );
  assert.equal(
    requireValue(r.comparisons)[0].city.country,
    requireValue(first.comparisons)[0].city.country,
  );
  requireValue(changed).cities[0].lat = taipei.lat;
  await assert.rejects(
    answerQuestion(await input('那下午呢？', { context: changed }), {
      ...options,
      config: { apiKey: 'fixture' },
      transport: async () => {
        throw Error('unexpected model call');
      },
    }),
    { status: 400 },
  );
  requireValue(changed).cities[0].lat = seoul.lat;
  requireValue(changed).plan.startDay = 7;
  await assert.rejects(
    answerQuestion(await input('那下午呢？', { context: changed }), {
      ...options,
      config: { apiKey: 'fixture' },
      transport: async () => {
        throw Error('unexpected model call');
      },
    }),
    { status: 400 },
  );
});
test('noncatalog follow-ups revalidate the saved lookup and use server city labels', async () => {
  const queries: string[] = [],
    kyoto = {
      id: 1857910,
      name: 'Kyoto',
      country: 'Japan',
      region: 'Kyoto',
      lat: 35.0116,
      lon: 135.7681,
    };
  const searchPlaces = async (q: string) => {
    queries.push(q);
    return { places: [kyoto] };
  };
  const transport = (cityQueries: string[]) => async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              cityQueries,
              plan: {
                intent: 'rain',
                window: 'local',
                startDay: 1,
                dayCount: 1,
                fromHour: 7,
                toHour: 9,
              },
              alignmentZone: null,
            }),
          },
        },
      ],
    });
  const settings = { ...options, config: { apiKey: 'fixture' }, searchPlaces };
  const first = await answerQuestion(await input('Kyoto和台北明天7–9下雨比较'), {
    ...settings,
    transport: transport(['Kyoto', 'Taipei']),
  });
  const context = structuredClone(first.context);
  requireValue(context).cities[0].name = 'False city';
  const next = await answerQuestion(await input('哪个更容易下雨？', { context }), {
    ...settings,
    transport: transport([]),
  });
  assert.equal(requireValue(next.comparisons)[0].city.name, 'Kyoto');
  assert.equal(requireValue(next.context).cities[0].lookup, 'Kyoto');
  assert.deepEqual(queries, ['Kyoto', 'Kyoto']);
});
test('model cannot invent comparison cities after the current city changes', async () => {
  const first = await answerQuestion(await input('首尔和台北明天下午下雨比较'), options);
  const london = catalog[3],
    forecast = await service.getWeather(london.lat, london.lon);
  const result = await answerQuestion(
    {
      question: '哪个更冷？',
      locale: 'zh-Hans',
      lat: london.lat,
      lon: london.lon,
      version: forecast.version,
      context: first.context,
    },
    {
      ...options,
      config: { apiKey: 'fixture' },
      transport: async () => {
        throw Error('unexpected model call');
      },
    },
  );
  assert.equal(result.context, undefined);
  assert.equal(result.comparisons, undefined);
  assert.equal(result.version, forecast.version);
});
test('model follow-up cannot silently replace the retained afternoon and date', async () => {
  const first = await answerQuestion(await input('首尔和台北明天下午下雨比较'), options);
  const r = await answerQuestion(await input('哪个更冷？', { context: first.context }), {
    ...options,
    config: { apiKey: 'fixture' },
    transport: async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                cityQueries: [],
                plan: {
                  intent: 'temperature',
                  window: 'local',
                  startDay: 0,
                  dayCount: 1,
                  fromHour: 0,
                  toHour: 23,
                },
                alignmentZone: null,
              }),
            },
          },
        ],
      }),
  });
  assert.equal(requireValue(r.context).plan.startDay, 1);
  assert.equal(requireValue(r.context).plan.fromHour, 12);
  assert.equal(requireValue(r.context).plan.toHour, 17);
  assert(requireValue(r.comparisons).every((c) => c.evidence.length === 6));
});
test('comparison model timeout and provider rate limit retain distinct HTTP errors', async () => {
  const i = await input('首尔和台北明天 7–9 下雨比较');
  await assert.rejects(
    answerQuestion(i, {
      ...options,
      config: { apiKey: 'fixture' },
      transport: async () => {
        throw new DOMException('timeout', 'TimeoutError');
      },
    }),
    { status: 504, code: 'MODEL_TIMEOUT' },
  );
  await assert.rejects(
    answerQuestion(i, {
      ...options,
      config: { apiKey: 'fixture' },
      transport: async () => new Response('', { status: 429 }),
    }),
    { status: 429, code: 'MODEL_RATE_LIMITED' },
  );
});
test('short Korean follow-up preserves cities even when model repeats ambiguous translated names', async () => {
  const first = await answerQuestion(await input('首尔和台北明天下午下雨比较'), options);
  const r = await answerQuestion(
    await input('어느 곳이 더 추워요?', { context: first.context, locale: 'ko' }),
    {
      ...options,
      config: { apiKey: 'fixture' },
      searchPlaces: async () => {
        throw Error('unexpected geocoding');
      },
      transport: async () =>
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  cityQueries: ['unrecognized Seoul variant', 'Taiwan'],
                  plan: {
                    intent: 'temperature',
                    window: 'local',
                    startDay: 0,
                    dayCount: 1,
                    fromHour: 0,
                    toHour: 23,
                  },
                  alignmentZone: null,
                }),
              },
            },
          ],
        }),
    },
  );
  assert.deepEqual(
    requireValue(r.comparisons).map((c) => c.city.lat),
    requireValue(first.comparisons).map((c) => c.city.lat),
  );
  assert(requireValue(r.comparisons).every((c) => c.evidence.length === 6));
});
test('persistent cache survives service reconstruction, merges concurrent fills and enforces stale cap', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'atlas-cache-'));
  let t = 1000000,
    calls = 0;
  try {
    const a = createSharedStore(dir, () => t),
      b = createSharedStore(dir, () => t),
      load = async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 60));
        return { version: 'v1', fetchedAt: t };
      };
    const cacheOptions = {
      validate: (
        value: unknown,
      ): value is { version: string; fetchedAt: number; stale?: boolean } =>
        isRecord(value) &&
        typeof value.version === 'string' &&
        isFiniteNumber(value.fetchedAt) &&
        (value.stale === undefined || typeof value.stale === 'boolean'),
    };
    const rows = await Promise.all([
      a.getOrLoad('city', load, cacheOptions),
      b.getOrLoad('city', load, cacheOptions),
    ]);
    assert.equal(calls, 1);
    assert.deepEqual(rows[0], rows[1]);
    await createSharedStore(dir, () => t).getOrLoad('city', load, cacheOptions);
    assert.equal(calls, 1);
    t += 16 * 60000;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => (release = r));
    const stale = await a.getOrLoad<{ version: string; fetchedAt: number; stale?: boolean }>(
      'city',
      async () => {
        await gate;
        throw Error('offline');
      },
      cacheOptions,
    );
    assert.equal(stale.stale, true);
    assert.equal(stale.fetchedAt, 1000000);
    requireValue(release)();
    await new Promise((r) => setTimeout(r, 100));
    t += 4 * 3600000;
    await assert.rejects(
      b.getOrLoad(
        'city',
        async () => {
          throw Error('offline');
        },
        cacheOptions,
      ),
      /offline/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('two real node processes share cold-cache upstream work and global AI budget', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'atlas-process-'));
  const moduleURL = new URL('../lib/shared-store.ts', import.meta.url).href;
  const code = `import {createSharedStore,sharedLimiter} from ${JSON.stringify(moduleURL)};let store=createSharedStore(process.argv[1]);let data=await store.getOrLoad('cold',async()=>{await new Promise(r=>setTimeout(r,100));const old=await store.read('upstream-count');await store.write('upstream-count',{count:(old?.count||0)+1});return {ok:true}},{validate:value=>value?.ok===true});let allow=sharedLimiter({store,limit:1});console.log(JSON.stringify({data,allowed:await allow()}));`;
  const run = () =>
    new Promise<{ allowed: boolean }>((resolve, reject) => {
      const p = spawn(process.execPath, ['--input-type=module', '-e', code, dir]);
      let out = '',
        err = '';
      p.stdout.on('data', (b: Buffer) => (out += b));
      p.stderr.on('data', (b: Buffer) => (err += b));
      p.on('exit', (c) => (c ? reject(Error(err)) : resolve(JSON.parse(out))));
    });
  try {
    const rows = await Promise.all([run(), run()]);
    assert.equal(rows.filter((x) => x.allowed).length, 1);
    assert.deepEqual(await createSharedStore(dir).read('upstream-count'), { count: 1 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('shared limiter resets after interval across store instances', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'atlas-budget-'));
  let t = 0;
  try {
    const a = sharedLimiter({ store: createSharedStore(dir), limit: 2, now: () => t }),
      b = sharedLimiter({ store: createSharedStore(dir), limit: 2, now: () => t });
    assert.equal(await a(), true);
    assert.equal(await b(), true);
    assert.equal(await a(), false);
    t = 60001;
    assert.equal(await b(), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('comparison explicit civil date preserves both autumn hours and skips nonexistent spring hour', async () => {
  for (const [stamp, date, from, to, expectedNY] of [
    ['2026-10-31T12:00Z', '2026-11-01', 1, 2, 3],
    ['2026-03-07T12:00Z', '2026-03-08', 1, 3, 2],
  ]) {
    const clock = () => Date.parse(String(stamp)),
      s = createWeatherService({ demo: true, clock }),
      ny = catalog[5];
    const f = await s.getWeather(ny.lat, ny.lon);
    const r = await answerQuestion(
      {
        question: `Compare New York and London rain ${date} ${from}–${to}`,
        locale: 'en',
        lat: ny.lat,
        lon: ny.lon,
        version: f.version,
      },
      { getWeather: s.getWeather, now: clock },
    );
    assert.equal(requireValue(r.comparisons)[0].date, date);
    assert.equal(requireValue(r.comparisons)[1].date, date);
    assert.equal(
      requireValue(requireValue(r.comparisons).find((c) => c.timezone === 'America/New_York'))
        .evidence.length,
      expectedNY,
    );
    assert(requireValue(r.comparisons).every((c) => c.complete));
  }
});
test('one unavailable city retains the other city evidence and gives no winner', async () => {
  const r = await answerQuestion(await input('首尔和台北明天 7–9 下雨比较'), {
    ...options,
    getWeather: async (lat: unknown, lon: unknown) => {
      if (lat === taipei.lat) throw Error('offline');
      return service.getWeather(lat, lon);
    },
  });
  assert.equal(requireValue(r.comparisons)[1].version, 'missing');
  assert.equal(requireValue(r.comparisons)[0].complete, true);
  assert.match(r.answer, /无法比较/);
});
test('telemetry projection drops precise location, URL, question and identity; p75 has sample window', () => {
  const input = {
    id: 'v5-test-1',
    name: 'LCP',
    value: 1200,
    locale: 'zh-Hans',
    pageType: 'city',
    device: 'mobile',
    latitude: 37.123456,
    url: '/explore?lat=37',
    question: 'private',
    ip: '1.2.3.4',
  };
  const safe = validateMetric(input);
  assert.deepEqual(Object.keys(safe), ['id', 'name', 'value', 'locale', 'pageType', 'device']);
  assert.throws(() => validateMetric({ ...input, name: 'GPS' }));
  const groups = summarizeMetrics(
    [1, 2, 3, 4].map((n) => ({
      ...safe,
      value: n * 100,
      receivedAt: time + n,
      dataset: 'controlled',
    })),
  );
  assert.equal(groups[0].count, 4);
  assert.equal(groups[0].p75, 300);
  assert(groups[0].from && groups[0].to);
});
