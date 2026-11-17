import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import type { AskResult } from './types.ts';
import type { WeatherMessage, WeatherPhase, AskFailure } from './chat-types.ts';
import { AskError } from './ask.ts';

export const askFailure = (error: unknown): AskFailure =>
  error instanceof AskError
    ? { status: error.status, code: error.code }
    : { status: 503, code: 'FORECAST_UNAVAILABLE' };

export function streamAsk(
  signal: AbortSignal,
  execute: (signal: AbortSignal, phase: (phase: WeatherPhase) => void) => Promise<AskResult>,
) {
  const cancellation = new AbortController();
  const combined = AbortSignal.any([signal, cancellation.signal]);
  const stream = createUIMessageStream<WeatherMessage>({
    execute: async ({ writer }) => {
      writer.write({ type: 'start' });
      const result = await execute(combined, (phase) => {
        if (!combined.aborted)
          writer.write({ type: 'data-phase', data: { phase }, transient: true });
      });
      combined.throwIfAborted();
      writer.write({ type: 'text-start', id: 'answer' });
      // 校验后按自然段输出；不添加模拟打字延迟，不额外请求模型改写数值。
      for (const line of result.answer.match(/[^\n]*\n|[^\n]+$/g) || []) {
        combined.throwIfAborted();
        writer.write({ type: 'text-delta', id: 'answer', delta: line });
      }
      writer.write({ type: 'text-end', id: 'answer' });
      writer.write({ type: 'data-weather', id: 'forecast', data: result });
      writer.write({ type: 'finish' });
    },
    onError: (error) => JSON.stringify(askFailure(error)),
  });
  const reader = stream.getReader();
  const cancellable = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    async cancel(reason: unknown) {
      cancellation.abort(reason);
      await reader.cancel(reason);
    },
  });
  return createUIMessageStreamResponse({
    stream: cancellable,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
