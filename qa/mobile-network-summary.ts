import { decode } from '../web/lib/validation.ts';
import { validNetworkRow } from './lib/network-contract.ts';
import { readObject, arrayAt } from './lib/json.ts';
import { requireValue } from '../web/lib/validation.ts';
import type { NetworkRow } from './mobile-network-proxy.ts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const port = Number(process.argv[2] || 3309),
  name = process.argv[3] || 'native-network-android-rules';
assert(/^[a-z0-9-]+$/.test(name));
const report = await fetch(`http://127.0.0.1:${port}/__qa/report`).then(async (r) => ({
  rows: arrayAt(await readObject(r), 'rows').map((row) => decode(row, validNetworkRow)),
}));
const count = (phase: string, path: string) =>
  report.rows.filter(
    (r: { phase: string; path: string }) =>
      r.phase === phase && (path === 'tiles' ? r.path.startsWith('/api/tiles/') : r.path === path),
  ).length;
const confirmed = report.rows.filter(
  (r: { phase: string; path: string }) => r.phase === 'confirm' && r.path === '/api/weather',
);
const summary: {
  homeTiles: number;
  languageWeather: number;
  dragWeather: number;
  mapLanguageWeather: number;
  pointBeforeConfirmWeather: number;
  confirmed: { lat: string | null; lon: string | null; status: number | null | undefined }[];
  tileLanguages: (string | undefined)[];
  answers: {
    source?: string;
    model?: string;
    modelMs?: number;
    plan?: unknown;
    cities: { name: string; date: string | null; value: number | null; version: string }[];
  }[];
  askStatuses: (number | null | undefined)[];
} = {
  homeTiles: count('home', 'tiles'),
  languageWeather: count('language', '/api/weather'),
  dragWeather: count('map-drag', '/api/weather'),
  mapLanguageWeather: count('map-language', '/api/weather'),
  pointBeforeConfirmWeather: count('map-point', '/api/weather'),
  confirmed: confirmed.map(({ lat, lon, status }) => ({ lat, lon, status })),
  tileLanguages: [
    ...new Set(
      report.rows
        .filter((r: { path: string }) => r.path.startsWith('/api/tiles/'))
        .map((r: { path: string }) => r.path.split('/')[3]),
    ),
  ].sort(),
  answers: [],
  askStatuses: report.rows
    .filter((r: { path: string }) => r.path === '/api/ask')
    .map((r) => r.status),
};
for (const key of [
  'homeTiles',
  'languageWeather',
  'dragWeather',
  'mapLanguageWeather',
  'pointBeforeConfirmWeather',
] as const)
  assert.equal(summary[key], 0);
assert.equal(confirmed.length, 1);
assert.equal(confirmed[0].status, 200);
assert.deepEqual(summary.tileLanguages, ['en', 'ko', 'zh-Hans', 'zh-Hant']);
const answers = report.rows.filter((r) => r.path === '/api/ask' && r.status === 200);
assert.equal(answers.length, 3);
for (const [i, row] of answers.entries()) {
  assert(row.ask && !row.ask.decodeError);
  assert(requireValue(row.ask.comparisons).every((c) => c.complete));
  assert.equal(requireValue(row.ask.plan).intent, i === 2 ? 'temperature' : 'rain');
  assert.equal(requireValue(row.ask.plan).fromHour, i === 0 ? 7 : 12);
  assert.equal(requireValue(row.ask.plan).toHour, i === 0 ? 9 : 17);
  assert.equal(row.ask.dateAnchor, requireValue(answers[0].ask).dateAnchor);
  assert.deepEqual(
    requireValue(row.ask.comparisons).map((c) => c.date),
    requireValue(requireValue(answers[0].ask).comparisons).map((c) => c.date),
  );
  for (const city of requireValue(row.ask.comparisons)) {
    assert.equal(requireValue(city.forecast).version, city.version);
    assert.equal(requireValue(city.forecast).timezone, city.timezone);
    if (name.includes('-live-')) assert.equal(requireValue(city.forecast).source, 'open-meteo');
    const field = i === 2 ? 'temp' : 'rain',
      values = city.evidence.map((e) => e[field]);
    assert.equal(
      city.value,
      i === 2
        ? Math.min(...values.map((v) => requireValue(v)))
        : Math.max(...values.map((v) => requireValue(v))),
    );
    for (const e of city.evidence) {
      assert.equal(e.version, city.version);
      assert.equal(requireValue(e.city).lat, city.city.lat);
      assert.equal(requireValue(e.city).lon, city.city.lon);
      const h = requireValue(requireValue(city.forecast).comparisonHours).find(
        (h) => h.time === e.time,
      );
      assert(h);
      assert.equal(h.temp, e.temp);
      assert.equal(h.rain, e.rain);
    }
  }
}
summary.answers = answers.map((r) => ({
  source: requireValue(r.ask).source,
  model: requireValue(r.ask).model,
  modelMs: requireValue(r.ask).modelMs,
  plan: requireValue(r.ask).plan,
  cities: requireValue(requireValue(r.ask).comparisons).map((c) => ({
    name: c.city.name,
    date: c.date,
    value: c.value,
    version: c.version,
  })),
}));
await writeFile(
  new URL(`./evidence/${name}.json`, import.meta.url),
  JSON.stringify({ ...report, summary }, null, 2),
);
console.log(JSON.stringify(summary));
