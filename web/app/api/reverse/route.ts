import { reversePlace } from '../../../lib/reverse.ts';
import { respond } from '../../../lib/http.ts';
export async function GET(request: { url: string | URL }) {
  const q = new URL(request.url).searchParams;
  return respond(() => reversePlace(q.get('lat'), q.get('lon'), q.get('lang') || 'en'));
}
