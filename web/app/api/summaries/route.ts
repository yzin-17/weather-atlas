import { getSummaries, parseBatch } from '../../../lib/weather.ts';
import { respond } from '../../../lib/http.ts';
export async function GET(request: { url: string | URL }) {
  const q = new URL(request.url).searchParams;
  return respond(() => getSummaries(parseBatch(q.get('coords'))));
}
