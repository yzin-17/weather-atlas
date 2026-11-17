import test from 'node:test';
import { requireValue } from '../lib/validation.ts';
import { readObject } from '../../qa/lib/json.ts';
import assert from 'node:assert/strict';
import { makeAskHandler } from '../lib/ask-http.ts';
import { createWeatherService } from '../lib/weather.ts';
import { isRecord } from '../lib/validation.ts';

const now = () => Date.parse('2026-11-17T03:00Z');
const service = createWeatherService({ demo: true, clock: now });
const forecast = await service.getWeather(37.566, 126.9784);
const input = {
  question: '当前气温',
  locale: 'zh-Hans',
  lat: 37.566,
  lon: 126.9784,
  version: forecast.version,
};
const request = (body = input, signal?: AbortSignal) =>
  new Request('http://localhost/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });
function frames(text: string): Record<string, unknown>[] {
  return text
    .split('\n')
    .filter((line) => line.startsWith('data: ') && !line.includes('[DONE]'))
    .map((line) => JSON.parse(line.slice(6)))
    .filter(isRecord);
}

test('SDK SSE 在天气完成前发送进度，最后文本与结构化依据一致；JSON 保持兼容', async () => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const handler = makeAskHandler(
    {
      getWeather: async () => {
        await gate;
        return forecast;
      },
      now,
    },
    () => true,
  );
  const response = await handler(request());
  assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  assert.equal(response.headers.get('x-vercel-ai-ui-message-stream'), 'v1');
  const reader = requireValue(response.body).getReader(),
    decoder = new TextDecoder();
  let content = '';
  while (!content.includes('data-phase')) content += decoder.decode((await reader.read()).value);
  assert(!content.includes('data-weather'));
  requireValue(release)();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    content += decoder.decode(value);
  }
  const chunks = frames(content);
  const result = chunks.find((chunk) => chunk.type === 'data-weather')?.data;
  assert(isRecord(result));
  assert.equal(
    chunks
      .filter((chunk) => chunk.type === 'text-delta')
      .map((chunk) => chunk.delta)
      .join(''),
    result.answer,
  );
  assert(content.includes('[DONE]'));
  const jsonRequest = request();
  jsonRequest.headers.set('accept', 'application/json');
  const json = await handler(jsonRequest);
  assert.equal(json.status, 200);
  assert.deepEqual(await json.json(), result);
});

test('SSE 错误保留 409／429 业务码，不写入成功依据', async () => {
  const handler = makeAskHandler({ getWeather: service.getWeather, now }, () => true);
  const response = await handler(request({ ...input, version: 'old' }));
  const events = frames(await response.text());
  const failure = events.find((event) => event.type === 'error');
  assert(failure && typeof failure.errorText === 'string');
  assert.deepEqual(JSON.parse(failure.errorText), { status: 409, code: 'STALE_FORECAST' });
  assert(!events.some((event) => event.type === 'data-weather'));
  const limited = makeAskHandler({ getWeather: service.getWeather, now }, () => false);
  const denied = await limited(request());
  assert.equal(denied.status, 429);
  assert.equal((await readObject(denied)).code, 'RATE_LIMITED');
});

test('取消 SSE 响应体会中断正在进行的模型请求', async () => {
  let began: (() => void) | undefined, aborted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  const ended = new Promise<void>((resolve) => {
    aborted = resolve;
  });
  const handler = makeAskHandler(
    {
      getWeather: service.getWeather,
      now,
      config: { apiKey: 'fixture', model: 'fixture' },
      transport: async (_url, init) => {
        requireValue(began)();
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener(
            'abort',
            () => {
              requireValue(aborted)();
              reject(new DOMException('Stopped', 'AbortError'));
            },
            { once: true },
          );
        });
      },
    },
    () => true,
  );
  const response = await handler(request());
  const reader = requireValue(response.body).getReader();
  await reader.read();
  await started;
  await reader.cancel('user stopped');
  await ended;
});

test('在共享天气加载中停止，不继续调用模型；共享天气加载仍可完成', async () => {
  let release: (() => void) | undefined,
    calls = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const controller = new AbortController();
  const handler = makeAskHandler(
    {
      getWeather: async () => {
        await gate;
        return forecast;
      },
      now,
      config: { apiKey: 'fixture' },
      transport: async () => {
        calls++;
        throw Error('不应调用');
      },
    },
    () => true,
  );
  const response = await handler(request(input, controller.signal));
  controller.abort();
  requireValue(release)();
  await response.text();
  assert.equal(calls, 0);
});
