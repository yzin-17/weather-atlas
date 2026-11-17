import type {
  AskResult,
  ComparisonCity,
  ComparisonContext,
  ComparisonRow,
  DayWeather,
  Evidence,
  Locale,
  Place,
  PlaceLabel,
  StoredSummary,
  Summary,
  SummaryStore,
  LocalPlan,
  Plan,
  SingleContext,
} from './types.ts';
import { isLocale } from './catalog.ts';
import { validSnapshot } from './client-forecast.ts';
import { isArray, isFiniteNumber as finite, isRecord } from './validation.ts';
import { adviceIntents } from './weather-advice.ts';

const optional = <T>(value: unknown, guard: (value: unknown) => value is T) =>
  value === undefined || guard(value);
const text = (value: unknown): value is string => typeof value === 'string';
const nullableText = (value: unknown): value is string | null => value === null || text(value);
const nullableNumber = (value: unknown): value is number | null => value === null || finite(value);
const code = (value: unknown): value is number =>
  finite(value) && Number.isInteger(value) && value >= 0 && value <= 99;
const probability = (value: unknown): value is number | null =>
  value === null || (finite(value) && value >= 0 && value <= 100);
export const validCoordinates = (
  value: unknown,
): value is Record<PropertyKey, unknown> & { lat: number; lon: number } =>
  isRecord(value) &&
  finite(value.lat) &&
  Math.abs(value.lat) <= 90 &&
  finite(value.lon) &&
  Math.abs(value.lon) <= 180;
const localizedText = (value: unknown): value is Partial<Record<Locale, string>> =>
  isRecord(value) && Object.entries(value).every(([key, name]) => isLocale(key) && text(name));
export const validPlaceLabel = (value: unknown): value is PlaceLabel =>
  isRecord(value) &&
  text(value.name) &&
  text(value.region) &&
  text(value.country) &&
  text(value.source) &&
  (value.locale === undefined || isLocale(value.locale)) &&
  (value.level === undefined || value.level === 'city' || value.level === 'region') &&
  optional(value.names, localizedText) &&
  optional(value.countries, localizedText);
export const validPlace = (value: unknown): value is Place =>
  isRecord(value) &&
  validCoordinates(value) &&
  (text(value.id) || finite(value.id)) &&
  text(value.name) &&
  text(value.country) &&
  optional(value.region, text) &&
  optional(value.slug, text) &&
  optional(value.timezone, text) &&
  optional(value.lookup, text) &&
  optional(value.label, validPlaceLabel) &&
  (value.kind === undefined ||
    value.kind === 'gps' ||
    value.kind === 'pin' ||
    value.kind === 'place');
export const validPlaces = (value: unknown): value is { places: Place[] } =>
  isRecord(value) && isArray(value.places) && value.places.every(validPlace);
export const validSummary = (value: unknown): value is Summary =>
  isRecord(value) &&
  validCoordinates(value) &&
  finite(value.temp) &&
  code(value.code) &&
  optional(value.observedAt, nullableNumber) &&
  optional(value.timezone, nullableText) &&
  optional(value.fetchedAt, text) &&
  (value.stale === undefined || typeof value.stale === 'boolean') &&
  optional(value.time, finite);
export const validSummaries = (value: unknown): value is { items: Summary[] } =>
  isRecord(value) && isArray(value.items) && value.items.every(validSummary);
export const validSummaryStore = (value: unknown): value is SummaryStore =>
  isRecord(value) &&
  Object.values(value).every((row): row is StoredSummary => validSummary(row) && finite(row.time));
export const validLocalPlan = (value: unknown): value is LocalPlan =>
  isRecord(value) &&
  text(value.intent) &&
  ['rain', 'temperature', 'warmest', 'coolest', 'walk', ...adviceIntents].includes(value.intent) &&
  value.window === 'local' &&
  [value.startDay, value.dayCount, value.fromHour, value.toHour].every(
    (n) => finite(n) && Number.isInteger(n),
  ) &&
  finite(value.startDay) &&
  finite(value.dayCount) &&
  finite(value.fromHour) &&
  finite(value.toHour) &&
  value.startDay >= -366 &&
  value.startDay <= 366 &&
  value.dayCount >= 1 &&
  value.dayCount <= 90 &&
  value.fromHour >= 0 &&
  value.toHour <= 23 &&
  value.fromHour <= value.toHour;
const comparisonCity = (value: unknown): value is ComparisonCity =>
  isRecord(value) && validPlace(value) && text(value.version);
export const validComparisonContext = (value: unknown): value is ComparisonContext =>
  isRecord(value) &&
  text(value.origin) &&
  finite(value.createdAt) &&
  optional(value.dateAnchor, finite) &&
  isArray(value.cities) &&
  value.cities.length === 2 &&
  value.cities.every(comparisonCity) &&
  validLocalPlan(value.plan) &&
  nullableText(value.alignmentZone) &&
  optional(value.requestedDate, nullableText);
const evidence = (value: unknown): value is Evidence =>
  isRecord(value) &&
  finite(value.time) &&
  optional(value.date, text) &&
  optional(value.temp, nullableNumber) &&
  optional(value.rain, probability) &&
  optional(value.code, code) &&
  optional(value.min, finite) &&
  optional(value.max, finite) &&
  optional(value.timezone, text) &&
  optional(value.version, text) &&
  (value.city === undefined ||
    (isRecord(value.city) &&
      validCoordinates(value.city) &&
      (text(value.city.id) || finite(value.city.id)) &&
      text(value.city.name)));
const day = (value: unknown): value is DayWeather =>
  isRecord(value) && text(value.date) && finite(value.min) && finite(value.max) && code(value.code);
export const validComparisonRow = (value: unknown): value is ComparisonRow =>
  isRecord(value) &&
  validPlace(value.city) &&
  nullableText(value.timezone) &&
  nullableText(value.windowTimezone) &&
  nullableText(value.date) &&
  finite(value.fromHour) &&
  finite(value.toHour) &&
  text(value.version) &&
  nullableText(value.fetchedAt) &&
  nullableNumber(value.value) &&
  text(value.unit) &&
  typeof value.complete === 'boolean' &&
  isArray(value.evidence) &&
  value.evidence.every(evidence) &&
  (value.forecast === null || validSnapshot(value.forecast));
const singlePlan = (value: unknown): value is Plan => {
  if (!isRecord(value)) return false;
  if (value.intent === 'unsupported' || value.intent === 'outside')
    return value.window === undefined;
  if (
    !text(value.intent) ||
    !['rain', 'temperature', 'warmest', 'coolest', 'walk', 'daily', ...adviceIntents].includes(
      value.intent,
    )
  )
    return false;
  if (value.window === 'now')
    return value.intent === 'temperature' || value.intent === 'conditions';
  if (value.window === 'next')
    return (
      value.intent !== 'daily' &&
      finite(value.hours) &&
      Number.isInteger(value.hours) &&
      value.hours >= 1 &&
      value.hours <= 168
    );
  if (value.window === 'local') return validLocalPlan(value);
  return (
    value.window === 'days' &&
    value.intent === 'daily' &&
    finite(value.startDay) &&
    Number.isInteger(value.startDay) &&
    Math.abs(value.startDay) <= 366 &&
    finite(value.dayCount) &&
    Number.isInteger(value.dayCount) &&
    value.dayCount >= 1 &&
    value.dayCount <= 90
  );
};
export const validSingleContext = (value: unknown): value is SingleContext =>
  isRecord(value) &&
  text(value.origin) &&
  finite(value.createdAt) &&
  finite(value.dateAnchor) &&
  comparisonCity(value.city) &&
  text(value.city.lookup) &&
  singlePlan(value.plan);
export const validAskResult = (value: unknown): value is AskResult =>
  isRecord(value) &&
  text(value.answer) &&
  text(value.version) &&
  (value.source === 'model' || value.source === 'rules') &&
  isArray(value.evidence) &&
  value.evidence.every(evidence) &&
  optional(value.context, validComparisonContext) &&
  optional(value.singleContext, validSingleContext) &&
  (value.singleForecast === undefined ||
    (isRecord(value.singleForecast) &&
      validPlace(value.singleForecast.city) &&
      validSnapshot(value.singleForecast.forecast))) &&
  (value.comparisons === undefined ||
    (isArray(value.comparisons) && value.comparisons.every(validComparisonRow))) &&
  optional(value.model, nullableText) &&
  optional(value.modelMs, nullableNumber) &&
  (value.dailyEvidence === undefined ||
    (isArray(value.dailyEvidence) && value.dailyEvidence.every(day)));
