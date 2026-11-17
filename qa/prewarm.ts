import { errorInfo } from '../web/lib/errors.ts';
import { catalog } from '../web/lib/catalog.ts';
import { getWeather } from '../web/lib/weather.ts';
let running = false;
async function warm() {
  if (running) return;
  running = true;
  try {
    for (let i = 0; i < catalog.length; i += 2)
      await Promise.all(
        catalog.slice(i, i + 2).map(async (city) => {
          const t = performance.now();
          try {
            const f = await getWeather(city.lat, city.lon);
            console.log(
              JSON.stringify({
                event: 'prewarm',
                city: city.slug,
                ok: true,
                stale: f.stale,
                ms: Math.round(performance.now() - t),
              }),
            );
          } catch (e) {
            console.log(
              JSON.stringify({
                event: 'prewarm',
                city: city.slug,
                ok: false,
                code: errorInfo(e).code,
                ms: Math.round(performance.now() - t),
              }),
            );
          }
        }),
      );
  } finally {
    running = false;
  }
}
await warm();
if (!process.argv.includes('--once')) {
  const timer = setInterval(warm, 10 * 60000);
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => {
      clearInterval(timer);
      process.exit(0);
    });
}
