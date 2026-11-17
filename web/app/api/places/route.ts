import { searchPlaces } from '../../../lib/weather.ts';
import { browserLocale } from '../../../lib/catalog.ts';
import { respond } from '../../../lib/http.ts';
export async function GET(request: { url: string | URL }) {
  const q = new URL(request.url).searchParams;
  return respond(() => searchPlaces(q.get('q'), browserLocale(q.get('lang'))));
}
