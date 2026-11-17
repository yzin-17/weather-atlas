import { readStats } from './lib/json.ts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { catalog, locales } from '../web/lib/catalog.ts';
const origin = process.env.APP_URL || 'http://127.0.0.1:3301';
async function stats() {
  return fetch('http://127.0.0.1:3399/stats').then((r) => readStats(r));
}
for (const city of catalog) {
  await fetch(`${origin}/api/weather?lat=${city.lat}&lon=${city.lon}`).then((r) => readStats(r));
  await new Promise((r) => setTimeout(r, 80));
  await fetch(`${origin}/api/weather?lat=${city.lat}&lon=${city.lon}`).then((r) => readStats(r));
}
const before = await stats();
for (const city of catalog)
  for (const locale of locales) {
    const response = await fetch(`${origin}/${locale}/weather/${city.slug}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert(html.includes(city.timezone));
    assert(!html.includes('comparisonHours'));
  }
const after = await stats(),
  forecast = after.calls.forecast - before.calls.forecast;
assert.equal(forecast, 0);
const report: {
  at: string;
  cityPages: 24;
  forecastUpstreamDuringLanguageSSR: 0;
  comparisonHoursInHTML: false;
  before: unknown;
  after: unknown;
} = {
  at: new Date().toISOString(),
  cityPages: 24,
  forecastUpstreamDuringLanguageSSR: forecast,
  comparisonHoursInHTML: false,
  before: before.calls,
  after: after.calls,
};
await writeFile(
  new URL('./evidence/language-cache.json', import.meta.url),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
