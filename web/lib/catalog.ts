import type { Locale, Coordinates, Place, CatalogCity } from './types.ts';
type CityTuple = [
  number,
  string,
  number,
  number,
  string,
  CatalogCity['names'],
  CatalogCity['countries'],
];
export const locales: Locale[] = ['zh-Hans', 'zh-Hant', 'en', 'ko'];
export const languageNames = {
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  en: 'English',
  ko: '한국어',
};
const cities: CityTuple[] = [
  [
    1835848,
    'seoul',
    37.566,
    126.9784,
    'Asia/Seoul',
    ['首尔', '首爾', 'Seoul', '서울'],
    ['韩国', '韓國', 'South Korea', '대한민국'],
  ],
  [
    1815286,
    'chengdu',
    30.6667,
    104.0667,
    'Asia/Shanghai',
    ['成都', '成都', 'Chengdu', '청두'],
    ['中国', '中國', 'China', '중국'],
  ],
  [
    1668341,
    'taipei',
    25.0478,
    121.5319,
    'Asia/Taipei',
    ['台北', '臺北', 'Taipei', '타이베이'],
    ['台湾', '臺灣', 'Taiwan', '대만'],
  ],
  [
    2643743,
    'london',
    51.5085,
    -0.1257,
    'Europe/London',
    ['伦敦', '倫敦', 'London', '런던'],
    ['英国', '英國', 'United Kingdom', '영국'],
  ],
  [
    1850147,
    'tokyo',
    35.6895,
    139.6917,
    'Asia/Tokyo',
    ['东京', '東京', 'Tokyo', '도쿄'],
    ['日本', '日本', 'Japan', '일본'],
  ],
  [
    5128581,
    'new-york',
    40.7143,
    -74.006,
    'America/New_York',
    ['纽约', '紐約', 'New York', '뉴욕'],
    ['美国', '美國', 'United States', '미국'],
  ],
];
const cityEntry = ([id, slug, lat, lon, timezone, names, countries]: CityTuple): CatalogCity => ({
  id,
  slug: `${slug}-${id}`,
  lat,
  lon,
  timezone,
  names,
  countries,
});
const shenzhen = cityEntry([
  1795565,
  'shenzhen',
  22.5455,
  114.0683,
  'Asia/Shanghai',
  ['深圳', '深圳', 'Shenzhen', '선전'],
  ['中国', '中國', 'China', '중국'],
]);
const hongKong = cityEntry([
  1819729,
  'hong-kong',
  22.2783,
  114.1747,
  'Asia/Hong_Kong',
  ['香港', '香港', 'Hong Kong', '홍콩'],
  ['中国', '中國', 'China', '중국'],
]);
export const catalog = [...cities.map(cityEntry), shenzhen, hongKong];
export const defaultCity = shenzhen;
export const defaultCities = [
  defaultCity,
  catalog[0],
  hongKong,
  catalog[4],
  catalog[5],
  catalog[3],
];
export const cityDirectory = catalog;
export function localPlace(city: CatalogCity, locale: Locale): Place {
  const index = locales.indexOf(locale);
  return { ...city, name: city.names[index], country: city.countries[index] };
}
export function localize(place: Place, locale: Locale): Place {
  if (isCoordinatePlace(place) && place.label?.names?.[locale])
    return {
      ...place,
      name: place.label.names[locale],
      country: place.label.countries?.[locale] || place.country,
    };
  const city = cityDirectory.find((item) => String(item.id) === String(place.id));
  return city ? localPlace(city, locale) : place;
}
export function isCoordinatePlace(place: Partial<Pick<Place, 'id' | 'kind'>>) {
  return (
    ['gps', 'pin'].includes(place.kind || '') || /^(gps|pin|point)(?:-|$)/.test(String(place.id))
  );
}
export function coordinatesValid(lat: number, lon: number) {
  return (
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
  );
}
export function publicCityForPlace(place: Coordinates & Partial<Place>) {
  // 城市 ID 与坐标同时吻合才复用公开页；地图／GPS 始终保留精确选点。
  if (isCoordinatePlace(place)) return undefined;
  return catalog.find(
    (city) =>
      String(city.id) === String(place.id) &&
      Math.abs(city.lat - place.lat) < 0.00001 &&
      Math.abs(city.lon - place.lon) < 0.00001,
  );
}
export function placeURL(locale: Locale, place: Coordinates & Partial<Place>) {
  const city = publicCityForPlace(place);
  if (city) return `/${locale}/weather/${city.slug}`;
  const params = new URLSearchParams({
    lat: String(place.lat),
    lon: String(place.lon),
    name: place.name ?? '',
    country: place.country ?? '',
    id: String(place.id ?? ''),
  });
  if (place.kind === 'gps' || place.kind === 'pin') params.set('kind', place.kind);
  if (place.region) params.set('region', place.region);
  return `/${locale}/explore?${params}`;
}
export function browserLocale(raw: string | null | undefined): Locale {
  const tag = (raw || '').toLowerCase();
  if (tag.startsWith('zh')) return /hant|tw|hk|mo/.test(tag) ? 'zh-Hant' : 'zh-Hans';
  return tag.startsWith('ko') ? 'ko' : 'en';
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && locales.some((locale) => locale === value);
}
