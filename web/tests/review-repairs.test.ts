import test from 'node:test';
import assert from 'node:assert/strict';
import { requestWeather, retryDelay, WeatherRequestError } from '../lib/weather-request.ts';
import { AskError, WeatherError, isAskError, isWeatherError } from '../lib/service-errors.ts';
import { respond } from '../lib/http.ts';
import { forecastNamespace } from '../lib/weather.ts';
import { forecastKey } from '../lib/client-forecast.ts';
import { isRecord } from '../lib/validation.ts';

test('天气客户端按状态和契约分类，不透传上游原文', async (t) => {
  for (const [status, code, reason] of [
    [429, 'RATE_LIMITED', 'limited'],
    [408, '', 'timeout'],
    [504, '', 'timeout'],
    [503, 'UPSTREAM_UNAVAILABLE', 'unavailable'],
    [503, 'BUSY', 'unavailable'],
    [400, 'INVALID_INPUT', 'input'],
    [502, 'INVALID_UPSTREAM', 'invalid'],
  ]) {
    t.mock.method(globalThis, 'fetch', async () =>
      Response.json(
        { code, error: 'private upstream detail' },
        { status: Number(status), headers: { 'Retry-After': '2' } },
      ),
    );
    await assert.rejects(
      requestWeather({ lat: 0, lon: 0 }, new AbortController().signal),
      (e) =>
        e instanceof WeatherRequestError &&
        e.reason === reason &&
        !e.message.includes('private') &&
        (reason !== 'limited' || e.retryMs === 2000),
    );
    t.mock.restoreAll();
  }
});
test('断网、非法成功体和取消分别处理，重试等待有界', async (t) => {
  const point = { lat: 0, lon: 0 };
  t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('network');
  });
  await assert.rejects(
    requestWeather(point, new AbortController().signal),
    (e) => e instanceof WeatherRequestError && e.reason === 'network',
  );
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => Response.json({ bad: true }));
  await assert.rejects(
    requestWeather(point, new AbortController().signal),
    (e) => e instanceof WeatherRequestError && e.reason === 'invalid',
  );
  t.mock.restoreAll();
  const abort = new AbortController();
  abort.abort();
  t.mock.method(globalThis, 'fetch', async () => {
    throw abort.signal.reason;
  });
  await assert.rejects(requestWeather(point, abort.signal), (e) => e === abort.signal.reason);
  assert.equal(retryDelay(null), 30_000);
  assert.equal(retryDelay('999999'), 300_000);
  assert.equal(retryDelay('0'), 1000);
  assert.equal(retryDelay('bad'), 30_000);
  assert.equal(retryDelay(new Date(5000).toUTCString(), 1000), 4000);
});
test('显式异常守卫不改写 instanceof，并拒绝无品牌或非法状态', async () => {
  const known = new WeatherError(429, 'RATE_LIMITED', 'wait');
  assert(known instanceof Error);
  assert(known instanceof WeatherError);
  assert(isWeatherError(known));
  const ask = new AskError(409, 'STALE_VERSION', 'refresh');
  assert(ask instanceof AskError);
  assert(isAskError(ask));
  assert.equal(isWeatherError(ask), false);
  for (const candidate of [
    null,
    {},
    { status: 503, code: 'BUSY', message: 'unknown' },
    new WeatherError(200, 'BUSY', 'bad'),
    new WeatherError(503.5, 'BUSY', 'bad'),
    new WeatherError(503, '', 'bad'),
  ]) {
    assert.equal(isWeatherError(candidate), false);
    const response = await respond(() => {
      throw candidate;
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      code: 'INTERNAL',
      error: 'Unexpected weather service error',
    });
  }
  const response = await respond(() => {
    throw known;
  });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '30');
});
test('问答跨模块副本由显式守卫识别', async () => {
  const other: unknown = await import('../lib/service-errors.ts' + '?ask-copy');
  assert(isRecord(other) && typeof other.AskError === 'function');
  const error: unknown = Reflect.construct(other.AskError, [409, 'STALE_VERSION', 'refresh']);
  assert.equal(error instanceof AskError, false);
  assert(isAskError(error));
  assert.equal(error.status, 409);
});
test('客户端缓存键隔离同 source 的供方、demo 与旧版键，不包含地址秘密', () => {
  const a = forecastNamespace(false, 'https://user:secret@provider.test/forecast?a=1');
  const b = forecastNamespace(false, 'https://user:secret@provider.test/forecast?a=2');
  const p = { lat: 22.5455, lon: 114.0683 };
  assert.notEqual(forecastKey(p, a), forecastKey(p, b));
  assert.equal(
    forecastKey(p, a),
    forecastKey(p, forecastNamespace(false, 'https://user:secret@provider.test/forecast?a=1')),
  );
  assert.notEqual(forecastKey(p, a), forecastKey(p, forecastNamespace(true)));
  assert.notEqual(forecastKey(p, a), `weather.${p.lat},${p.lon}`);
  assert(!/secret|provider.test|https/.test(forecastKey(p, a)));
});
