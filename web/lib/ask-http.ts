import type { AskOptions } from './types.ts';
import { answerQuestion, AskError, validateInput } from './ask.ts';
import { isAskError } from './service-errors.ts';
import { sharedLimiter } from './shared-store.ts';
import { streamAsk } from './ask-stream.ts';
import type { WeatherPhase } from './chat-types.ts';

export function makeLimiter({ limit = 24, interval = 60000, now = Date.now } = {}) {
  // Global per-process ceiling also protects deployments without a trusted IP header.
  const accepted: number[] = [];
  return () => {
    const time = now();
    while (accepted.length && accepted[0] <= time - interval) accepted.shift();
    if (accepted.length >= limit) return false;
    accepted.push(time);
    return true;
  };
}

async function readJson(request: Request): Promise<unknown> {
  const max = 8192;
  if (Number(request.headers.get('content-length')) > max)
    throw new AskError(413, 'QUESTION_TOO_LARGE', 'Request is too large.');
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json'))
    throw new AskError(415, 'INVALID_CONTENT_TYPE', 'Send JSON.');
  const reader = request.body?.getReader();
  if (!reader) throw new AskError(400, 'INVALID_INPUT', 'A JSON request is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new AskError(413, 'QUESTION_TOO_LARGE', 'Request is too large.');
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (e) {
    if (isAskError(e)) throw e;
    throw new AskError(400, 'INVALID_INPUT', 'A valid JSON request is required.');
  } finally {
    reader.releaseLock();
  }
}

const response = (payload: unknown, status = 200, moreHeaders = {}) =>
  Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store', ...moreHeaders },
  });

export function makeAskHandler(
  options: AskOptions,
  allowed: () => boolean | Promise<boolean> = sharedLimiter(),
) {
  return async function handle(request: Request) {
    try {
      const raw = await readJson(request);
      validateInput(raw);
      if (!(await allowed()))
        return response(
          {
            code: 'RATE_LIMITED',
            error: 'Too many questions. Try again shortly.',
          },
          429,
          { 'Retry-After': '60' },
        );
      const searchPlaces = options.searchPlaces;
      const execute = (signal: AbortSignal, phase: (value: WeatherPhase) => void = () => {}) =>
        answerQuestion(raw, {
          ...options,
          getWeather: async (...args) => {
            signal.throwIfAborted();
            phase('weather');
            const weather = await options.getWeather(...args);
            signal.throwIfAborted();
            return weather;
          },
          ...(searchPlaces
            ? {
                searchPlaces: async (
                  ...args: Parameters<NonNullable<AskOptions['searchPlaces']>>
                ) => {
                  signal.throwIfAborted();
                  phase('city');
                  const places = await searchPlaces(...args);
                  signal.throwIfAborted();
                  return places;
                },
              }
            : {}),
          transport: (url, init) => {
            signal.throwIfAborted();
            phase('model');
            return (options.transport || fetch)(url, {
              ...init,
              signal: AbortSignal.any([signal, ...(init.signal ? [init.signal] : [])]),
            });
          },
        });
      if (request.headers.get('accept')?.includes('text/event-stream'))
        return streamAsk(request.signal, execute);
      return response(await execute(request.signal));
    } catch (e) {
      if (isAskError(e)) return response({ code: e.code, error: e.message }, e.status);
      return response(
        {
          code: 'FORECAST_UNAVAILABLE',
          error: 'The forecast is temporarily unavailable.',
        },
        503,
      );
    }
  };
}
