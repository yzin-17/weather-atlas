import { isRecord, isFiniteNumber, parseJson } from '../../web/lib/validation.ts';

export interface ModelEvent {
  event: 'model-call' | 'model-result';
  at: number;
  model: string;
  status?: string | number;
  ms?: number;
}
export function modelEvent(value: unknown): value is ModelEvent {
  return (
    isRecord(value) &&
    (value.event === 'model-call' || value.event === 'model-result') &&
    isFiniteNumber(value.at) &&
    typeof value.model === 'string' &&
    (value.status === undefined ||
      typeof value.status === 'string' ||
      isFiniteNumber(value.status)) &&
    (value.ms === undefined || isFiniteNumber(value.ms))
  );
}
export function traceEvent(line: string): ModelEvent | null {
  try {
    const value = parseJson(line);
    return modelEvent(value) ? value : null;
  } catch {
    return null;
  }
}
