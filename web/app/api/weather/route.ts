import { getWeather } from '../../../lib/weather.ts';
import { respond } from '../../../lib/http.ts';
export async function GET(request: { url: string | URL }) {
  const q = new URL(request.url).searchParams;
  return respond(() => getWeather(q.get('lat'), q.get('lon'), { fresh: q.get('fresh') === '1' }));
}
