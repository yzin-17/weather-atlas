'use client';
import { DefaultChatTransport } from 'ai';
import type { WeatherMessage } from '../lib/chat-types.ts';
import type { AskResult } from '../lib/types.ts';
import { validAskResult } from '../lib/contracts.ts';
import { isRecord } from '../lib/validation.ts';

export const messageText = (message: WeatherMessage) =>
  message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
export function messageWeather(message: WeatherMessage): AskResult | null {
  const part = message.parts.find((part) => part.type === 'data-weather');
  return part?.type === 'data-weather' && validAskResult(part.data) ? part.data : null;
}
export function failureKey(error: Error) {
  let value: unknown;
  try {
    value = JSON.parse(error.message);
  } catch {
    return 'offline' as const;
  }
  if (!isRecord(value)) return 'offline' as const;
  return value.status === 409
    ? ('askChanged' as const)
    : value.status === 429
      ? ('limited' as const)
      : ['CITY_NOT_FOUND', 'AMBIGUOUS_CITY'].includes(String(value.code))
        ? ('askCity' as const)
        : value.status === 400
          ? ('askInput' as const)
          : ('offline' as const);
}
export function weatherTransport() {
  return new DefaultChatTransport<WeatherMessage>({
    api: '/api/ask',
    headers: { accept: 'text/event-stream' },
    // 消息由 SDK 在浏览器管理；服务端继续只接收受限问题与经过校验的城市上下文。
    prepareSendMessagesRequest: ({ body }) => ({ body: body || {} }),
    fetch: async (url, init) => {
      const response = await fetch(url, init);
      if (!response.ok) {
        const failure: unknown = await response.json().catch(() => null);
        throw new Error(
          JSON.stringify({
            status: response.status,
            code:
              isRecord(failure) && typeof failure.code === 'string'
                ? failure.code
                : 'FORECAST_UNAVAILABLE',
          }),
        );
      }
      return response;
    },
  });
}
