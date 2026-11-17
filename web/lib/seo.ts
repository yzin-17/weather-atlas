import type { Metadata } from 'next';
import type { CatalogCity, Locale } from './types.ts';
import { locales, localPlace } from './catalog.ts';
import { labels } from './ui-text.ts';
import { siteOrigin } from './site-config.ts';
export function origin() {
  return siteOrigin();
}
export const ogLocales = { 'zh-Hans': 'zh_CN', 'zh-Hant': 'zh_TW', en: 'en_US', ko: 'ko_KR' };
function socialMeta(locale: Locale, title: string, description: string, url: string) {
  const image = {
    url: `${origin()}/social-image`,
    width: 1200,
    height: 630,
    type: 'image/png',
    alt: `Weather Atlas · ${labels(locale).homeTitle}`,
  };
  return {
    openGraph: {
      title,
      description,
      url,
      type: 'website' as const,
      siteName: 'Weather Atlas',
      locale: ogLocales[locale],
      alternateLocale: locales.filter((l) => l !== locale).map((l) => ogLocales[l]),
      images: [image],
    },
    twitter: {
      card: 'summary_large_image' as const,
      title,
      description,
      images: [{ url: image.url, alt: image.alt }],
    },
  };
}
export function homeMeta(locale: Locale) {
  const t = labels(locale);
  const languages = Object.fromEntries(locales.map((l) => [l, `${origin()}/${l}`]));
  languages['x-default'] = languages.en;
  const title = `Weather Atlas · ${t.homeTitle}`;
  return {
    title,
    description: t.homeDescription,
    alternates: { canonical: languages[locale], languages },
    ...socialMeta(locale, title, t.homeDescription, languages[locale]),
    // 四语首页提供稳定的介绍和城市导航，个人地点只在客户端恢复。
    robots: { index: process.env.WEATHER_MODE !== 'demo', follow: true },
  };
}
export function cityMeta(city: CatalogCity, locale: Locale, { forecastAvailable = true } = {}) {
  const place = localPlace(city, locale),
    t = labels(locale),
    titles = {
      'zh-Hans': `${place.name}天气｜逐小时天气与未来 7 天预报`,
      'zh-Hant': `${place.name}天氣｜逐時天氣與未來 7 天預報`,
      en: `${place.name} weather · Hourly and 7-day forecast`,
      ko: `${place.name} 날씨 · 시간별 예보와 주간 예보`,
    };
  const languages = Object.fromEntries(
    locales.map((l) => [l, `${origin()}/${l}/weather/${city.slug}`]),
  );
  languages['x-default'] = languages.en;
  return {
    title: `${titles[locale]} | Weather Atlas`,
    description: `${place.name} · ${t.description}`,
    alternates: { canonical: languages[locale], languages },
    ...socialMeta(locale, titles[locale], `${place.name} · ${t.description}`, languages[locale]),
    robots: { index: process.env.WEATHER_MODE !== 'demo' && forecastAvailable, follow: true },
  };
}

interface SchemaReference {
  '@id': string;
}
interface PageNode {
  '@type': 'WebPage';
  '@id': string;
  url: string;
  name: string;
  description: string;
  inLanguage: Locale;
  isPartOf: SchemaReference;
  about?: SchemaReference;
}
interface SiteNode {
  '@type': 'WebSite';
  '@id': string;
  url: string;
  name: string;
  inLanguage: Locale[];
}
interface PlaceNode {
  '@type': 'Place';
  '@id': string;
  name: string;
  address: { '@type': 'PostalAddress'; addressCountry: string };
  geo: { '@type': 'GeoCoordinates'; latitude: number; longitude: number };
}
type SchemaNode = PageNode | SiteNode | PlaceNode;

export function pageSchema(locale: Locale, city: CatalogCity | null = null) {
  const base = origin();
  const metadata = city ? cityMeta(city, locale) : homeMeta(locale);
  const url = metadata.alternates.canonical;
  const page: PageNode = {
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: metadata.title,
    description: metadata.description,
    inLanguage: locale,
    isPartOf: { '@id': `${base}/#website` },
  };
  const graph: SchemaNode[] = [
    {
      '@type': 'WebSite',
      '@id': `${base}/#website`,
      url: `${base}/`,
      name: 'Weather Atlas',
      inLanguage: locales,
    },
    page,
  ];
  if (city) {
    const place = localPlace(city, locale);
    const id = `${base}/#place-${city.id}`;
    page.about = { '@id': id };
    graph.push({
      '@type': 'Place',
      '@id': id,
      name: place.name,
      address: { '@type': 'PostalAddress', addressCountry: place.country },
      geo: { '@type': 'GeoCoordinates', latitude: city.lat, longitude: city.lon },
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

export function serializeSchema(value: unknown) {
  // 防止 JSON 字符串提前结束 HTML script；仍可直接 JSON.parse。
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
