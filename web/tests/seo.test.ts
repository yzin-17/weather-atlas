import { requireValue } from '../lib/validation.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  catalog,
  defaultCity,
  defaultCities,
  locales,
  localPlace,
  placeURL,
  publicCityForPlace,
} from '../lib/catalog.ts';
import { homeMeta, cityMeta, pageSchema, serializeSchema } from '../lib/seo.ts';
import sitemap from '../app/sitemap.ts';
import robots from '../app/robots.ts';
import { siteOrigin } from '../lib/site-config.ts';
import { negotiateLocale } from '../lib/locale-negotiation.ts';
import { GET as rootRedirect } from '../app/(home)/route.ts';

test('Shenzhen is the fallback and recommendations follow the configured six-city order', () => {
  assert.equal(defaultCity.id, 1795565);
  assert.deepEqual(
    defaultCities.map((city) => city.id),
    [1795565, 1835848, 1819729, 1850147, 5128581, 2643743],
  );
  assert(catalog.some((city) => city.id === 1815286));
  assert(catalog.some((city) => city.id === 1668341));
});

test('all default cities have localized public URLs, metadata and sitemap entries', () => {
  const entries = sitemap();
  for (const city of defaultCities)
    for (const locale of locales) {
      assert(catalog.some((item) => item.id === city.id));
      const place = localPlace(city, locale);
      assert.equal(placeURL(locale, place), `/${locale}/weather/${city.slug}`);
      assert.equal(publicCityForPlace(place)?.id, city.id);
      if (process.env.WEATHER_MODE !== 'demo')
        assert(entries.some((entry) => entry.url === cityMeta(city, locale).alternates.canonical));
    }
});

test('GPS, pins and mismatched coordinates never become a public city by ID alone', () => {
  const city = requireValue(defaultCities.find((city) => city.id === 1795565));
  const place = localPlace(city, 'zh-Hans');
  for (const selected of [
    { ...place, kind: 'gps' as const },
    { ...place, kind: 'pin' as const },
    { ...place, lat: place.lat + 0.1 },
    { ...place, lon: place.lon + 0.1 },
    { ...place, id: 'point-22.5455,114.0683' },
  ]) {
    assert.equal(publicCityForPlace(selected), undefined);
    const url = new URL(placeURL('zh-Hans', selected), 'http://localhost');
    assert.equal(url.pathname, '/zh-Hans/explore');
    assert.equal(Number(url.searchParams.get('lat')), selected.lat);
    assert.equal(Number(url.searchParams.get('lon')), selected.lon);
  }
});

test('public page schema matches canonical, language and the actual catalog city', () => {
  for (const city of catalog)
    for (const locale of locales) {
      const schema = pageSchema(locale, city),
        metadata = cityMeta(city, locale);
      assert.equal(schema['@context'], 'https://schema.org');
      const site = schema['@graph'].find((n) => n['@type'] === 'WebSite');
      const page = schema['@graph'].find((n) => n['@type'] === 'WebPage');
      const place = schema['@graph'].find((n) => n['@type'] === 'Place');
      assert(page && place && site);
      assert.equal(page.url, metadata.alternates.canonical);
      assert.equal(requireValue(page).inLanguage, locale);
      assert.equal(requireValue(page).name, metadata.title);
      assert.equal(page.isPartOf['@id'], requireValue(site)['@id']);
      assert.equal(requireValue(page.about)['@id'], requireValue(place)['@id']);
      assert.equal(requireValue(place).name, localPlace(city, locale).name);
      assert.equal(place.geo.latitude, city.lat);
      assert.equal(place.geo.longitude, city.lon);
      assert.equal(metadata.twitter.card, 'summary_large_image');
    }
});

test('site origin rejects misleading deployment configuration and requires an explicit production URL', () => {
  assert.equal(siteOrigin({ NODE_ENV: 'development' }), 'http://localhost:3300');
  assert.equal(
    siteOrigin({ SITE_URL: 'https://weather.example.org/' }),
    'https://weather.example.org',
  );
  assert.equal(
    siteOrigin({ NEXT_PUBLIC_SITE_URL: 'https://weather.example.org' }),
    'https://weather.example.org',
  );
  for (const SITE_URL of [
    'https://weather.example.org/app',
    'https://weather.example.org/?x=1',
    'https://weather.example.org/#x',
    'https://user:pass@weather.example.org',
    'file:///tmp/app',
    'javascript:alert(1)',
    'not-a-url',
    'https://weather.exa\nmple.org',
  ])
    assert.throws(() => siteOrigin({ SITE_URL }));
  assert.throws(() => siteOrigin({ NODE_ENV: 'production' }), /SITE_URL/);
});

test('root locale negotiation uses supported weighted preferences rather than only the first range', () => {
  for (const [header, locale] of [
    ['', 'en'],
    ['fr-FR,ko;q=0.9,en;q=0.8', 'ko'],
    ['ko;q=0.2,en;q=0.9', 'en'],
    ['zh-TW,zh;q=0.9', 'zh-Hant'],
    ['zh-CN', 'zh-Hans'],
    ['en;q=0,ko;q=0.9', 'ko'],
    ['en;q=0,*;q=0.5', 'zh-Hans'],
    ['fr,*;q=0.1', 'en'],
    ['ko;q=bogus,en', 'en'],
    ['fr-FR ; q=0.8, ko-KR ; q=0.9', 'ko'],
    ['en;q=0.5,*;q=1', 'zh-Hans'],
  ])
    assert.equal(negotiateLocale(header), locale, header);
});

test('all public metadata has a real PNG preview, localized alt text and OG locale alternatives', () => {
  const expected = { 'zh-Hans': 'zh_CN', 'zh-Hant': 'zh_TW', en: 'en_US', ko: 'ko_KR' };
  for (const locale of locales)
    for (const meta of [homeMeta(locale), ...catalog.map((c) => cityMeta(c, locale))]) {
      assert.equal(meta.openGraph.locale, expected[locale]);
      assert.deepEqual(
        meta.openGraph.alternateLocale,
        locales.filter((l) => l !== locale).map((l) => expected[l]),
      );
      assert.equal(meta.openGraph.images[0].width, 1200);
      assert.equal(meta.openGraph.images[0].height, 630);
      assert.equal(meta.openGraph.images[0].type, 'image/png');
      assert(meta.openGraph.images[0].url.endsWith('/social-image'));
      assert(meta.openGraph.images[0].alt);
      assert.equal(meta.twitter.images[0].url, meta.openGraph.images[0].url);
    }
});

test('indexable home has complete metadata without claiming a default city', () => {
  for (const locale of locales) {
    const metadata = homeMeta(locale),
      schema = pageSchema(locale);
    assert(metadata.alternates.canonical.endsWith(`/${locale}`));
    assert.equal(metadata.alternates.canonical, metadata.alternates.languages[locale]);
    assert.equal(Object.keys(metadata.alternates.languages).length, 5);
    assert(metadata.description);
    assert.equal(metadata.openGraph.url, metadata.alternates.canonical);
    assert.equal(metadata.robots.index, process.env.WEATHER_MODE !== 'demo');
    assert.deepEqual(
      schema['@graph'].map((n) => n['@type']),
      ['WebSite', 'WebPage'],
    );
    assert.equal(schema['@graph'].find((node) => node['@type'] === 'WebPage')?.about, undefined);
  }
});

test('a city without any usable forecast is temporarily noindex while stable homes remain indexable', () => {
  for (const locale of locales) {
    assert.equal(cityMeta(catalog[0], locale, { forecastAvailable: false }).robots.index, false);
    assert.equal(
      cityMeta(catalog[0], locale, { forecastAvailable: true }).robots.index,
      process.env.WEATHER_MODE !== 'demo',
    );
    assert.equal(homeMeta(locale).robots.index, process.env.WEATHER_MODE !== 'demo');
  }
});

test('live sitemap includes four self-canonical homes while demo remains excluded', () => {
  const previous = process.env.WEATHER_MODE;
  try {
    process.env.WEATHER_MODE = 'live';
    const urls = sitemap();
    assert.equal(urls.length, locales.length * (catalog.length + 1));
    for (const locale of locales) {
      const meta = homeMeta(locale);
      assert.equal(meta.robots.index, true);
      const entry = urls.find((e) => e.url === meta.alternates.canonical);
      assert.deepEqual(entry?.alternates.languages, meta.alternates.languages);
    }
    process.env.WEATHER_MODE = 'demo';
    assert.deepEqual(sitemap(), []);
    assert.equal(robots().rules.allow, '/');
    assert.equal(robots().rules.disallow, '/api/');
    for (const locale of locales) assert.equal(homeMeta(locale).robots.index, false);
  } finally {
    if (previous === undefined) delete process.env.WEATHER_MODE;
    else process.env.WEATHER_MODE = previous;
  }
});

test('root redirect preserves language negotiation response headers and relative Location', () => {
  const response = rootRedirect(
    new Request('http://internal/', { headers: { 'accept-language': 'fr-FR,ko;q=0.9' } }),
  );
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), '/ko');
  assert.equal(response.headers.get('vary'), 'Accept-Language');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('JSON-LD safely round trips strings containing HTML closing tags and Unicode separators', () => {
  const input = { name: '</script><script>alert(1)</script>\u2028\u2029' };
  const text = serializeSchema(input);
  assert(!text.includes('<'));
  assert(!text.includes('\u2028'));
  assert(!text.includes('\u2029'));
  assert.deepEqual(JSON.parse(text), input);
});
