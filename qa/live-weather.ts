import { requireValue } from '../web/lib/validation.ts';
import { isRecord } from '../web/lib/validation.ts';
import { errorInfo } from '../web/lib/errors.ts';
import { createWeatherService } from '../web/lib/weather.ts';
import { writeFile } from 'node:fs/promises';
const service = createWeatherService(),
  rows: (
    | {
        city: string | number;
        ok: boolean;
        source: import('../web/lib/types.ts').WeatherSource;
        timezone: string;
        hours: number;
        comparisonHours: number;
        ms: number;
      }
    | { city: string | number; ok: boolean; status: unknown; code: unknown; ms: number }
  )[] = [];
for (const [city, lat, lon] of [
  ['Seoul', 37.577, 126.98],
  ['Taipei', 25.0478, 121.5319],
] as const) {
  const start = performance.now();
  try {
    const f = await service.getWeather(lat, lon);
    rows.push({
      city,
      ok: true,
      source: f.source,
      timezone: f.timezone,
      hours: f.hours.length,
      comparisonHours: requireValue(f.comparisonHours).length,
      ms: performance.now() - start,
    });
  } catch (e) {
    rows.push({
      city,
      ok: false,
      status: isRecord(e) && typeof e.status === 'number' ? e.status : undefined,
      code: errorInfo(e).code,
      ms: performance.now() - start,
    });
  }
}
const report: {
  at: string;
  attempts: number;
  rows: (
    | {
        city: string | number;
        ok: boolean;
        source: import('../web/lib/types.ts').WeatherSource;
        timezone: string;
        hours: number;
        comparisonHours: number;
        ms: number;
      }
    | { city: string | number; ok: boolean; status: unknown; code: unknown; ms: number }
  )[];
} = { at: new Date().toISOString(), attempts: rows.length, rows };
await writeFile(
  new URL('./evidence/live-weather.json', import.meta.url),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
