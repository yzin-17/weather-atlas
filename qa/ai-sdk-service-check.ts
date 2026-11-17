// 显式执行会调用当前 HTTPS 服务配置的模型一次；信任本机 CA 后运行。
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { askBody } from './lib/ask-sse.ts';
import { decode, isRecord } from '../web/lib/validation.ts';
import { validSnapshot } from '../web/lib/client-forecast.ts';
import { validAskResult } from '../web/lib/contracts.ts';

const http = process.env.APP_URL || 'http://127.0.0.1:3300';
const https = process.env.HTTPS_APP_URL || 'https://192.168.5.22:3443';
const expected = process.env.QA_SOURCE || 'model';
const pages: { base: string; status: number; htmlBytes: number }[] = [];
for (const base of [http, https]) {
  const response = await fetch(`${base}/zh-Hans/weather/seoul-1835848`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert(html.includes('首尔'));
  pages.push({ base, status: response.status, htmlBytes: Buffer.byteLength(html) });
}
const weatherResponse = await fetch(`${http}/api/weather?lat=37.566&lon=126.9784`);
assert.equal(weatherResponse.status, 200);
const raw: unknown = await weatherResponse.json();
const weather = decode(raw, validSnapshot);
const started = performance.now();
const response = await fetch(`${https}/api/ask`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
  body: JSON.stringify({
    question: '今天广州天气怎样',
    locale: 'zh-Hans',
    lat: 37.566,
    lon: 126.9784,
    version: weather.version,
  }),
  signal: AbortSignal.timeout(90000),
});
assert.equal(response.status, 200);
assert(response.headers.get('content-type')?.includes('text/event-stream'));
assert(response.body);
const reader = response.body.getReader(),
  decoder = new TextDecoder();
const chunks: { ms: number; bytes: number }[] = [];
let body = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  chunks.push({ ms: Math.round(performance.now() - started), bytes: value.byteLength });
  body += decoder.decode(value, { stream: true });
}
body += decoder.decode();
const result = decode(askBody(body), validAskResult);
assert.equal(result.source, expected);
if (expected === 'model') assert.equal(result.model, 'gpt-6-luna');
assert(result.singleForecast);
assert.equal(result.singleForecast.forecast.source, 'open-meteo');
assert(Math.abs(result.singleForecast.city.lat - 23.1) < 0.5);
assert(Math.abs(result.singleForecast.city.lon - 113.3) < 0.5);
assert.equal(result.singleForecast.forecast.timezone, 'Asia/Shanghai');
assert(result.dailyEvidence?.length);
const types: string[] = [];
for (const line of body.split('\n')) {
  if (!line.startsWith('data: ') || line.endsWith('[DONE]')) continue;
  const event: unknown = JSON.parse(line.slice(6));
  if (isRecord(event) && typeof event.type === 'string') types.push(event.type);
}
assert(
  types.includes('data-phase') && types.includes('text-delta') && types.includes('data-weather'),
);
const evidence = {
  at: new Date().toISOString(),
  pages,
  status: response.status,
  protocol: response.headers.get('x-vercel-ai-ui-message-stream'),
  contentType: response.headers.get('content-type'),
  firstChunkMs: chunks[0]?.ms,
  totalMs: Math.round(performance.now() - started),
  chunks,
  types,
  source: result.source,
  model: result.model,
  modelMs: result.modelMs,
  city: result.singleForecast.city,
  timezone: result.singleForecast.forecast.timezone,
  version: result.singleForecast.forecast.version,
  answer: result.answer,
  dailyEvidence: result.dailyEvidence,
};
await writeFile(
  new URL('./evidence/ai-sdk-service.json', import.meta.url),
  JSON.stringify(evidence, null, 2),
);
console.log(JSON.stringify(evidence));
