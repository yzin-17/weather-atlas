import type { ComparisonAnswer } from './contracts.ts';
import { askBody } from './ask-sse.ts';
import { validPlaceLabel, validAskResult } from '../../web/lib/contracts.ts';
import { validSnapshot } from '../../web/lib/client-forecast.ts';
import {
  decode,
  isRecord,
  isArray,
  isFiniteNumber,
  parseJson,
  readJson,
} from '../../web/lib/validation.ts';

export { parseJson };
export function jsonPath(value: unknown, ...keys: (string | number)[]): unknown {
  for (const key of keys) {
    if (isArray(value) && typeof key === 'number') value = value[key];
    else if (isRecord(value)) value = value[key];
    else throw Error(`Missing JSON field: ${String(key)}`);
  }
  return value;
}
export const textAt = (value: unknown, ...keys: (string | number)[]) =>
  decode(jsonPath(value, ...keys), (item): item is string => typeof item === 'string');
export const numberAt = (value: unknown, ...keys: (string | number)[]) =>
  decode(jsonPath(value, ...keys), isFiniteNumber);
export const objectAt = (value: unknown, ...keys: (string | number)[]) =>
  decode(jsonPath(value, ...keys), isRecord);
export const arrayAt = (value: unknown, ...keys: (string | number)[]) =>
  decode(jsonPath(value, ...keys), isArray);
export const recordsAt = (value: unknown, ...keys: (string | number)[]) =>
  arrayAt(value, ...keys).map((item) => decode(item, isRecord));

export const jsonObject = (text: string) => decode(parseJson(text), isRecord);
export const readObject = async (response: Pick<Response, 'json'>) =>
  decode(await readJson(response), isRecord);
export const readForecast = async (response: Pick<Response, 'json'>) =>
  decode(await readJson(response), validSnapshot);
export const readAnswer = async (
  response: Pick<Response, 'json'> & Partial<Pick<Response, 'text'>>,
) =>
  decode(response.text ? askBody(await response.text()) : await readJson(response), validAskResult);
export async function readComparison(response: Pick<Response, 'json'>): Promise<ComparisonAnswer> {
  const value = await readAnswer(response);
  if (!value.context || !value.comparisons) throw Error('Missing comparison context');
  return { ...value, context: value.context, comparisons: value.comparisons };
}
export async function readReverse(response: Pick<Response, 'json'>) {
  const value = await readObject(response);
  if (value.place !== null && !validPlaceLabel(value.place)) throw Error('Invalid reverse label');
  if (value.attribution !== null && typeof value.attribution !== 'string')
    throw Error('Invalid attribution');
  return { place: value.place, attribution: value.attribution };
}
export interface FixtureStats {
  calls: { forecast: number; summaries: number; geocoding: number; model: number };
  delay: number;
  failure: number;
}
export const validStats = (value: unknown): value is FixtureStats =>
  isRecord(value) &&
  isRecord(value.calls) &&
  isFiniteNumber(value.calls.forecast) &&
  isFiniteNumber(value.calls.summaries) &&
  isFiniteNumber(value.calls.geocoding) &&
  isFiniteNumber(value.calls.model) &&
  isFiniteNumber(value.delay) &&
  isFiniteNumber(value.failure);
export const readStats = async (response: Pick<Response, 'json'>) =>
  decode(await readJson(response), validStats);
