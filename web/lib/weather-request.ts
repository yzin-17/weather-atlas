import type { Coordinates } from './types.ts';
import { isRecord, readJson, decode } from './validation.ts';
import { validSnapshot } from './client-forecast.ts';

export type WeatherFailure =
  | 'network'
  | 'timeout'
  | 'limited'
  | 'unavailable'
  | 'input'
  | 'invalid';
export class WeatherRequestError extends Error {
  readonly reason: WeatherFailure;
  readonly retryMs: number;
  constructor(reason: WeatherFailure, retryMs = 0) {
    super(reason);
    this.reason = reason;
    this.retryMs = retryMs;
  }
}
export function retryDelay(value: string | null, now = Date.now()) {
  if (!value) return 30_000;
  const delay = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.max(1000, Math.min(300_000, delay)) : 30_000;
}
export async function requestWeather(place: Coordinates, signal: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(`/api/weather?lat=${place.lat}&lon=${place.lon}&fresh=1`, { signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new WeatherRequestError('network');
  }
  if (!response.ok) {
    const body = await readJson(response).catch(() => null);
    const code = isRecord(body) && typeof body.code === 'string' ? body.code : '';
    if (response.status === 429 || code === 'RATE_LIMITED')
      throw new WeatherRequestError('limited', retryDelay(response.headers.get('Retry-After')));
    if (response.status === 408 || response.status === 504 || code === 'UPSTREAM_TIMEOUT')
      throw new WeatherRequestError('timeout');
    if (code === 'INVALID_INPUT' || response.status === 400) throw new WeatherRequestError('input');
    if (code === 'INVALID_UPSTREAM') throw new WeatherRequestError('invalid');
    throw new WeatherRequestError('unavailable');
  }
  try {
    return decode(await readJson(response), validSnapshot);
  } catch {
    throw new WeatherRequestError('invalid');
  }
}
