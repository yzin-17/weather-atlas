/** 外部 JSON 保持 unknown；仅在检查后缩窄，避免标准库的 any 向业务传播。 */
export const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export const isArray = (value: unknown): value is unknown[] => Array.isArray(value);
export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
export function parseJson(text: string): unknown {
  return JSON.parse(text);
}
export async function readJson(response: Pick<Response, 'json'>): Promise<unknown> {
  return response.json();
}
export function decode<T>(value: unknown, guard: (value: unknown) => value is T): T {
  if (!guard(value)) throw new Error('Invalid data');
  return value;
}
export function requireValue<T>(value: T | null | undefined, message = 'Missing value'): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}
export const timed = (value: unknown): value is Record<PropertyKey, unknown> & { at: number } =>
  isRecord(value) && isFiniteNumber(value.at);
export function cacheRecord<T>(guard: (value: unknown) => value is T) {
  return (value: unknown): value is { at: number; value: T } =>
    isRecord(value) && timed(value) && guard(value.value);
}
