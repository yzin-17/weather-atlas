import { makeAskHandler } from '../../../lib/ask-http.ts';
import { getWeather, searchPlaces } from '../../../lib/weather.ts';

export const runtime = 'nodejs';
const handle = makeAskHandler({
  getWeather,
  searchPlaces,
  config: {
    apiKey: process.env.AI_API_KEY,
    baseUrl: process.env.AI_BASE_URL,
    model: process.env.AI_MODEL,
  },
});

export function POST(request: Request) {
  return handle(request);
}
