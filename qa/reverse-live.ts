import { readReverse } from './lib/json.ts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const base = process.env.APP_URL || 'http://127.0.0.1:3307';
const rows: (Awaited<ReturnType<typeof readReverse>> & {
  city: string;
  lat: number;
  lon: number;
  lang: string;
  status: number;
  ms: number;
})[] = [];
for (const [city, lat, lon] of [
  ['Seoul', 37.566, 126.9784],
  ['Taipei', 25.0478, 121.5319],
  ['Kyoto', 35.0116, 135.768],
  ['Ocean', 0, 0],
] as const) {
  for (const lang of ['en', 'zh-Hans', 'zh-Hant', 'ko'] as const) {
    const start = performance.now(),
      r = await fetch(
        base + '/api/reverse?' + new URLSearchParams({ lat: String(lat), lon: String(lon), lang }),
      ),
      body = await readReverse(r);
    rows.push({
      city,
      lat,
      lon,
      lang,
      status: r.status,
      ms: Math.round(performance.now() - start),
      ...body,
    });
  }
}
await writeFile(
  new URL('./evidence/reverse-live.json', import.meta.url),
  JSON.stringify(
    { at: new Date().toISOString(), provider: 'Photon public / OpenStreetMap', rows },
    null,
    2,
  ),
);
assert(rows.every((r) => r.status === 200));
for (const city of ['Seoul', 'Taipei', 'Kyoto'] as const)
  assert(
    rows.filter((r) => r.city === city).every((r) => r.place?.name && r.place.level === 'city'),
    city,
  );
assert(rows.filter((r) => r.city === 'Ocean').every((r) => r.place === null));
console.log(
  JSON.stringify(
    rows.map(({ city, lang, ms, place }) => ({
      city,
      lang,
      ms,
      name: place?.name,
      level: place?.level,
    })),
  ),
);
