import { trace } from './trace.ts';
import { decode, isRecord, parseJson, readJson } from './validation.ts';
export async function modelIntent(response: Response): Promise<unknown> {
  const payload = decode(await readJson(response), isRecord);
  if (!Array.isArray(payload.choices)) throw Error('Invalid model response');
  const choice: unknown = payload.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message) || typeof choice.message.content !== 'string')
    throw Error('Invalid model response');
  return parseJson(choice.message.content);
}
export async function plannerRequest(
  transport: (
    url: string | URL,
    init: RequestInit & { body: string },
  ) => Response | Promise<Response>,
  url: string | URL,
  init: RequestInit & { body: string },
) {
  const started = performance.now(),
    payload = decode(parseJson(init.body), isRecord),
    model = payload.model;
  // Luna 在这里仅提取短查询意图，关闭额外推理；其他模型保持原请求选项。
  if (typeof model === 'string' && /^gpt-6-luna(?:-|$)/.test(model)) {
    payload.reasoning_effort ??= 'none';
    init = { ...init, body: JSON.stringify(payload) };
  }
  trace('model-call', { model });
  try {
    const response = await transport(url, init);
    trace('model-result', {
      model,
      status: response.status,
      ms: Math.round(performance.now() - started),
    });
    return response;
  } catch (error) {
    trace('model-result', {
      model,
      status: 'transport-error',
      ms: Math.round(performance.now() - started),
    });
    throw error;
  }
}
