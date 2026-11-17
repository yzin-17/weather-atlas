import { readAnswer } from './lib/json.ts';
import type { Forecast } from '../web/lib/types.ts';
import type { ComparisonAnswer } from './lib/contracts.ts';
/** Run against a running Weather Atlas server. Node 22+, no extra packages. */
import assert from 'node:assert/strict';
import { validSnapshot } from '../web/lib/client-forecast.ts';
import { validPlaces, validSummaries } from '../web/lib/contracts.ts';
import { decode, readJson, isRecord } from '../web/lib/validation.ts';

const root = process.env.APP_URL || 'http://localhost:3000';
const origin = new URL(root).origin;
const locales = ['en', 'ko', 'zh-Hans', 'zh-Hant'];
const slug = 'seoul-1835848';
async function req(path: string, options: RequestInit = {}) {
  return fetch(origin + path, {
    ...options,
    signal: AbortSignal.timeout(40000),
  });
}
async function okJson<T>(
  path: string,
  guard: (value: unknown) => value is T,
  options: RequestInit = {},
) {
  const res = await req(path, options),
    data = await readJson(res);
  assert.equal(
    res.status,
    200,
    path + ': ' + (isRecord(data) ? String(data.error || res.status) : String(res.status)),
  );
  return decode(data, guard);
}
let forecast: Forecast = await okJson('/api/weather?lat=37.566&lon=126.9784', validSnapshot);
assert.equal(forecast.timezone, 'Asia/Seoul');
assert.equal(forecast.hours.length, 24);
assert.equal(forecast.days.length, 7);
console.log('PASS Seoul forecast, 24 hourly samples and 7 local dates (' + forecast.source + ')');
const places = await okJson(
  '/api/places?q=' + encodeURIComponent('서울') + '&lang=ko',
  validPlaces,
);
assert(places.places.some((p) => p.id === 1835848));
const batch = await okJson('/api/summaries?coords=37.566,126.9784;51.5085,-0.1257', validSummaries);
assert.equal(batch.items.length, 2);
assert(batch.items.every((i: { temp: unknown }) => Number.isFinite(i.temp)));
assert.equal((await req('/api/weather?lat=&lon=0')).status, 400);
console.log('PASS localized search, batch summaries and invalid coordinates');
for (const locale of locales) {
  const res = await req('/' + locale + '/weather/' + slug);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, new RegExp('<html[^>]+lang="' + locale + '"', 'i'));
  // Do not accidentally accept information that only exists in the hydration script.
  const visible = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  assert.match(visible, /<h1\b/i);
  assert.match(visible, /rel="canonical"/i);
  for (const alt of locales) assert.match(visible, new RegExp('hreflang="' + alt + '"', 'i'));
  assert.match(visible, /id="hour-\d+"/);
  assert.match(visible, /class="day"/);
  console.log('PASS original HTML, alternate languages, forecast rows and canonical: ' + locale);
}
assert.equal((await req('/en/weather/no-such-city-9999999')).status, 404);
const payload = {
  lat: 37.566,
  lon: 126.9784,
  question: 'Will I need an umbrella in the next few hours?',
  locale: 'en',
  version: forecast.version,
};
const ask = (body: unknown) =>
  req('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const old = await ask({ ...payload, version: 'outdated-demo-version' });
assert.equal(old.status, 409);
let result = await ask(payload);
if (result.status === 409) {
  forecast = await okJson('/api/weather?lat=37.566&lon=126.9784', validSnapshot);
  payload.version = forecast.version;
  result = await ask(payload);
}
const answer = await readAnswer(result);
assert.equal(result.status, 200);
assert(['model', 'rules'].includes(answer.source));
assert(answer.answer && answer.version === forecast.version);
for (const e of answer.evidence)
  assert(forecast.hours.some((h) => h.time === e.time && h.temp === e.temp && h.rain === e.rain));
console.log(
  'PASS forecast question, verified evidence and old-version rejection (' + answer.source + ')',
);
