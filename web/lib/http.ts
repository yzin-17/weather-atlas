import { errorInfo } from './errors.ts';
import { WeatherError } from './weather.ts';
import { trace } from './trace.ts';
import { type Summary, type Forecast } from './types.ts';
export async function respond(action: () => unknown | Promise<unknown>) {
  try {
    return Response.json(await action(), {
      headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' },
    });
  } catch (error) {
    const known = error instanceof WeatherError;
    trace('weather-error', { known, name: errorInfo(error).name, code: errorInfo(error).code });
    return Response.json(
      {
        error: known ? error.message : 'Unexpected weather service error',
        code: known ? error.code : 'INTERNAL',
      },
      {
        status: known ? error.status : 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
