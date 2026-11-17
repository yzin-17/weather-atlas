import { isRecord } from '../../web/lib/validation.ts';
export function askSse(data: unknown) {
  if (!isRecord(data) || typeof data.answer !== 'string') throw Error('Invalid answer fixture');
  const chunks = [
    { type: 'start', messageId: crypto.randomUUID() },
    { type: 'text-start', id: 'answer' },
    { type: 'text-delta', id: 'answer', delta: data.answer },
    { type: 'text-end', id: 'answer' },
    { type: 'data-weather', id: 'forecast', data },
    { type: 'finish' },
  ];
  return {
    contentType: 'text/event-stream',
    headers: { 'x-vercel-ai-ui-message-stream': 'v1' },
    body: chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n',
  };
}
export function askBody(text: string): unknown {
  if (!text.startsWith('data:')) return JSON.parse(text);
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
    const chunk: unknown = JSON.parse(line.slice(6));
    if (!isRecord(chunk)) continue;
    if (chunk.type === 'data-weather') return chunk.data;
    if (chunk.type === 'error') throw Error(String(chunk.errorText));
  }
  throw Error('Incomplete weather stream');
}
