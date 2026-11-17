/** 双端 HTTP 契约；时间戳单位为秒，fetchedAt 为 ISO 日期字符串。 */
export type Locale = 'zh-Hans' | 'zh-Hant' | 'en' | 'ko';
export interface Coordinates {
  lat: number;
  lon: number;
}
export interface PlaceLabel {
  name: string;
  country: string;
  region: string;
  source: string;
  locale?: Locale;
  level?: 'city' | 'region';
  names?: Partial<Record<Locale, string>>;
  countries?: Partial<Record<Locale, string>>;
  [key: string]: unknown;
}
export interface Place extends Coordinates {
  id: string | number;
  name: string;
  country: string;
  region?: string;
  slug?: string;
  timezone?: string;
  kind?: 'gps' | 'pin' | 'place';
  label?: PlaceLabel;
  lookup?: string;
}
export interface CatalogCity extends Coordinates {
  id: number;
  slug: string;
  timezone: string;
  names: [string, string, string, string];
  countries: [string, string, string, string];
}
export interface CurrentWeather {
  time: number;
  temp: number;
  code: number;
}
export interface HourWeather extends CurrentWeather {
  rain: number | null;
}
export interface DayWeather {
  date: string;
  min: number;
  max: number;
  code: number;
}
export type WeatherSource = 'demo' | 'fixture' | 'open-meteo';
export interface Forecast {
  version: string;
  source: WeatherSource;
  timezone: string;
  fetchedAt: string;
  stale: boolean;
  current: CurrentWeather;
  hours: HourWeather[];
  days: DayWeather[];
  comparisonHours?: HourWeather[];
}
export interface Summary extends Coordinates {
  temp: number;
  code: number;
  observedAt?: number | null;
  timezone?: string | null;
  fetchedAt?: string;
  stale?: boolean;
  time?: number;
}
export interface StoredSummary extends Summary {
  time: number;
}
export type SummaryStore = Record<string, StoredSummary>;
export type GetWeather = (
  lat: number,
  lon: number,
  options?: { fresh?: boolean },
) => Promise<Forecast>;
export type SearchPlaces = (query: string, locale: Locale) => Promise<{ places: Place[] }>;
export interface ModelConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}
export interface AskInput extends Coordinates {
  question: string;
  locale: Locale;
  version: string;
}
export type AdviceIntent = 'clothing' | 'outdoor' | 'laundry' | 'sun' | 'conditions';
export type Intent =
  | AdviceIntent
  | 'rain'
  | 'temperature'
  | 'warmest'
  | 'coolest'
  | 'walk'
  | 'daily'
  | 'outside'
  | 'unsupported';
type HourlyIntent = Exclude<Intent, 'daily' | 'outside' | 'unsupported'>;
export interface LocalPlan {
  intent: HourlyIntent;
  window: 'local';
  startDay: number;
  dayCount: number;
  fromHour: number;
  toHour: number;
}
export type Plan =
  | LocalPlan
  | { intent: HourlyIntent; window: 'next'; hours: number }
  | { intent: 'daily'; window: 'days'; startDay: number; dayCount: number }
  | { intent: 'temperature' | 'conditions'; window: 'now' }
  | { intent: 'unsupported' | 'outside'; window?: never };
export interface ComparisonCity extends Place {
  version: string;
}
export interface ComparisonContext {
  origin: string;
  createdAt: number;
  dateAnchor?: number;
  cities: ComparisonCity[];
  plan: LocalPlan;
  alignmentZone: string | null;
  requestedDate?: string | null;
}
export interface SingleContext {
  origin: string;
  createdAt: number;
  dateAnchor: number;
  city: ComparisonCity & { lookup: string };
  plan: Plan;
}
export interface SingleForecast {
  city: Place;
  forecast: Forecast;
}
export interface Evidence {
  time: number;
  date?: string;
  temp?: number | null;
  rain?: number | null;
  code?: number;
  min?: number;
  max?: number;
  city?: Pick<Place, 'id' | 'name' | 'lat' | 'lon'>;
  timezone?: string;
  version?: string;
}
export interface ComparisonRow {
  city: Place;
  timezone: string | null;
  windowTimezone: string | null;
  date: string | null;
  fromHour: number;
  toHour: number;
  version: string;
  fetchedAt: string | null;
  value: number | null;
  unit: string;
  complete: boolean;
  evidence: Evidence[];
  forecast: Forecast | null;
}
export interface AskResult {
  answer: string;
  evidence: Evidence[];
  source: 'model' | 'rules';
  version: string;
  context?: ComparisonContext;
  comparisons?: ComparisonRow[];
  model?: string | null;
  modelMs?: number | null;
  dailyEvidence?: DayWeather[];
  singleContext?: SingleContext;
  singleForecast?: SingleForecast;
}
export interface AskOptions {
  getWeather: GetWeather;
  searchPlaces?: SearchPlaces;
  config?: ModelConfig;
  transport?: (
    url: string | URL,
    init: RequestInit & { body: string },
  ) => Response | Promise<Response>;
  now?: () => number;
}
