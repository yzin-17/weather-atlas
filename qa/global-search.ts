import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { createWeatherService } from '../web/lib/weather.ts';
const service = createWeatherService(),
  rows: {
    places: import('../web/lib/types.ts').Place[];
    source?: string;
    q: string;
    lang: string;
    ms: number;
  }[] = [];
for (const [q, lang] of [
  ['서울', 'ko'],
  ['台北', 'zh-Hant'],
  ['Paris', 'en'],
  ['Kyoto', 'en'],
  ['zzzzunlikelycity', 'en'],
] as const) {
  const started = performance.now();
  const result = await service.searchPlaces(q, lang);
  rows.push({ q, lang, ms: performance.now() - started, ...result });
  if (q === 'Paris')
    assert(
      result.places.some((p) => p.country === 'France') &&
        result.places.some((p) => p.country === 'United States'),
    );
  if (q === 'Kyoto') assert(result.places.some((p) => p.id === 1857910));
  if (q === 'zzzzunlikelycity') assert.equal(result.places.length, 0);
}
await mkdir(new URL('./evidence/', import.meta.url), { recursive: true });
await writeFile(
  new URL('./evidence/global-search.json', import.meta.url),
  JSON.stringify(
    { at: new Date().toISOString(), source: '真实 Open-Meteo 地名服务，预报服务另行验证', rows },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    rows.map((r) => ({
      q: r.q,
      lang: r.lang,
      source: r.source,
      count: r.places.length,
      ms: Math.round(r.ms),
    })),
  ),
);
