import type { NetworkRow } from '../mobile-network-proxy.ts';
import { validComparisonRow, validLocalPlan } from '../../web/lib/contracts.ts';
import { isRecord, isArray, isFiniteNumber } from '../../web/lib/validation.ts';

const optionalText = (value: unknown) => value === undefined || typeof value === 'string';
const nullableText = (value: unknown) => value === null || typeof value === 'string';
export function validNetworkRow(value: unknown): value is NetworkRow {
  if (
    !isRecord(value) ||
    typeof value.phase !== 'string' ||
    typeof value.path !== 'string' ||
    !optionalText(value.method) ||
    !nullableText(value.lat) ||
    !nullableText(value.lon) ||
    !(value.status === undefined || value.status === null || isFiniteNumber(value.status))
  )
    return false;
  if (value.ask === undefined) return true;
  const ask = value.ask;
  return (
    isRecord(ask) &&
    (ask.decodeError === undefined || typeof ask.decodeError === 'boolean') &&
    optionalText(ask.code) &&
    optionalText(ask.source) &&
    optionalText(ask.model) &&
    (ask.modelMs === undefined || isFiniteNumber(ask.modelMs)) &&
    (ask.dateAnchor === undefined || isFiniteNumber(ask.dateAnchor)) &&
    (ask.plan === undefined || validLocalPlan(ask.plan)) &&
    (ask.comparisons === undefined ||
      (isArray(ask.comparisons) && ask.comparisons.every(validComparisonRow)))
  );
}
