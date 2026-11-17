import { readForecast, readObject, readComparison } from './lib/json.ts';
import { requireValue } from '../web/lib/validation.ts';
import type { ComparisonContext } from '../web/lib/types.ts';
import type { ComparisonAnswer } from './lib/contracts.ts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const base = process.env.APP_URL || 'http://127.0.0.1:3319';
const rows: {
  source: unknown;
  model: unknown;
  ms: number;
  intent: string | number;
  from: string | number;
  to: string | number;
  readings: unknown;
}[] = [];
let context: ComparisonContext | undefined;
let forecast = await fetch(base + '/api/weather?lat=37.566&lon=126.9784').then((r) =>
  readForecast(r),
);
const cases: [string, string, number, number][] = [
  ['首尔和台北明天早上7–9点，哪里更容易下雨？', 'rain', 7, 9],
  ['那下午呢？', 'rain', 12, 17],
  ['哪个更冷？', 'temperature', 12, 17],
];
for (const [question, intent, from, to] of cases) {
  const started = performance.now();
  const ask = () =>
    fetch(base + '/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question,
        locale: 'zh-Hans',
        lat: 37.566,
        lon: 126.9784,
        version: forecast.version,
        context,
      }),
    });
  let response = await ask();
  if (response.status === 409) {
    forecast = await fetch(base + '/api/weather?lat=37.566&lon=126.9784').then((r) =>
      readForecast(r),
    );
    if (context)
      context = {
        ...context,
        cities: await Promise.all(
          context.cities.map(async (city) => ({
            ...city,
            version: (
              await fetch(`${base}/api/weather?lat=${city.lat}&lon=${city.lon}`).then((r) =>
                readForecast(r),
              )
            ).version,
          })),
        ),
      };
    response = await ask();
  }
  const result = await readComparison(response);
  assert.equal(response.status, 200, result.code || '比较请求失败');
  assert.equal(result.source, 'model');
  assert.equal(result.model, 'gpt-6-luna');
  assert.equal(result.context.plan.intent, intent);
  assert.equal(result.context.plan.fromHour, from);
  assert.equal(result.context.plan.toHour, to);
  assert.equal(result.comparisons.length, 2);
  for (const row of result.comparisons) {
    assert.equal(requireValue(row.forecast).source, 'open-meteo');
    assert(row.complete && row.evidence.length === to - from + 1);
    assert.equal(
      row.value,
      intent === 'rain'
        ? Math.max(...row.evidence.map((hour) => requireValue(hour.rain)))
        : Math.min(...row.evidence.map((hour) => requireValue(hour.temp))),
    );
  }
  if (context)
    assert.deepEqual(
      result.context.cities.map((city) => [city.lat, city.lon]),
      context.cities.map((city) => [city.lat, city.lon]),
    );
  context = result.context;
  rows.push({
    source: result.source,
    model: result.model,
    ms: Math.round(performance.now() - started),
    intent,
    from,
    to,
    readings: result.comparisons.map((row) => ({
      city: row.city.name,
      date: row.date,
      value: row.value,
      timezone: row.timezone,
      version: row.version,
      evidence: row.evidence.length,
    })),
  });
}
await writeFile(
  new URL('./evidence/luna-comparison.json', import.meta.url),
  JSON.stringify({ at: new Date().toISOString(), base, rows }, null, 2),
);
console.log(JSON.stringify({ turns: rows.length, model: 'gpt-6-luna', status: '通过' }));
