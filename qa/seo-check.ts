import { jsonObject, recordsAt, jsonPath } from './lib/json.ts';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { catalog, locales, localPlace } from '../web/lib/catalog.ts';
import { type CatalogCity } from '../web/lib/types.ts';
const root = process.env.APP_URL || 'http://127.0.0.1:3301',
  canonicalRoot = process.env.SITE_URL || root;
const demo = process.env.WEATHER_MODE === 'demo',
  report: {
    at: string;
    root: string;
    demo: boolean;
    homes: {
      path: string;
      agent: string;
      bytes: number;
      checks: {
        lang: boolean;
        body: boolean;
        title: boolean;
        description: boolean;
        canonicalInHead: boolean;
        alternatesInHead: boolean;
        openGraph: boolean;
        twitter: boolean;
        index: boolean;
        homeDirectory: boolean;
        homeContent: boolean;
        jsonLd: boolean;
        schemaPage: boolean;
        schemaSite: boolean;
        schemaPlace: boolean;
        status: boolean;
        indexHeader: boolean;
      };
    }[];
    pages: {
      path: string;
      agent: string;
      bytes: number;
      checks: {
        lang: boolean;
        body: boolean;
        title: boolean;
        description: boolean;
        canonicalInHead: boolean;
        alternatesInHead: boolean;
        openGraph: boolean;
        twitter: boolean;
        index: boolean;
        homeDirectory: boolean;
        homeContent: boolean;
        jsonLd: boolean;
        schemaPage: boolean;
        schemaSite: boolean;
        schemaPlace: boolean;
        status: boolean;
        indexHeader: boolean;
      };
    }[];
    invalid?: 404;
    exploreNoindex?: true;
    exploreNoStructuredLocation?: true;
    sitemapURLs?: number;
    rootRedirect?: {
      status: number;
      target: string;
      indexedHomes: import('../web/lib/types.ts').Locale[];
    };
    robots?: string;
  } = { at: new Date().toISOString(), root, demo, homes: [], pages: [] };
const run = process.env.QA_SEO_RUN || `seo-${demo ? 'demo' : 'live'}`;
assert(/^[a-z0-9-]+$/.test(run));
await mkdir(new URL('./evidence/', import.meta.url), { recursive: true });
const agents = { browser: 'Mozilla/5.0 WeatherAtlas-SEO-Check', googlebot: 'Googlebot' };
function inspect(
  html: string,
  path: string,
  locale: import('../web/lib/types.ts').Locale,
  city?: CatalogCity,
) {
  const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
  const blocks = [
    ...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi),
  ];
  const graph = blocks.length === 1 ? jsonObject(blocks[0][1]) : null;
  const nodes = graph ? recordsAt(graph, '@graph') : [];
  const site = nodes.find((n) => n['@type'] === 'WebSite');
  const page = nodes.find((n) => n['@type'] === 'WebPage');
  const place = nodes.find((n) => n['@type'] === 'Place');
  const name = city && localPlace(city, locale).name;
  return {
    lang: html.includes(`<html lang="${locale}"`),
    body: html.includes('class="hour') && (!city || html.includes(name || '')),
    title: city
      ? new RegExp(`<title>[^<]*${name}`).test(head)
      : head.includes('<title>Weather Atlas'),
    description: head.includes('name="description"'),
    canonicalInHead: head.includes(`rel="canonical" href="${canonicalRoot + path}"`),
    alternatesInHead: [...locales, 'x-default'].every((l) => {
      const target = l === 'x-default' ? 'en' : l;
      return head.includes(
        `hrefLang="${l}" href="${canonicalRoot}/${target}${city ? `/weather/${city.slug}` : ''}"`,
      );
    }),
    openGraph: head.includes(`property="og:url" content="${canonicalRoot + path}"`),
    twitter: head.includes('name="twitter:card" content="summary_large_image"'),
    index: /<meta name="robots" content="[^"]*noindex/.test(head) === demo,
    homeDirectory:
      !!city || catalog.every((c) => html.includes(`href="/${locale}/weather/${c.slug}"`)),
    homeContent: !!city || html.includes('id="home-title"'),
    jsonLd: graph?.['@context'] === 'https://schema.org' && nodes.length === (city ? 3 : 2),
    schemaPage: page?.url === canonicalRoot + path && page?.inLanguage === locale,
    schemaSite:
      site?.url === canonicalRoot + '/' &&
      (page?.isPartOf && jsonPath(page.isPartOf, '@id')) === site?.['@id'],
    schemaPlace: city
      ? place?.name === name &&
        (place?.geo && jsonPath(place.geo, 'latitude')) === city.lat &&
        (place?.geo && jsonPath(place.geo, 'longitude')) === city.lon &&
        (page?.about && jsonPath(page.about, '@id')) === place?.['@id']
      : !place && !page?.about,
  };
}
for (const locale of locales) {
  const path = `/${locale}`;
  for (const [agent, userAgent] of Object.entries(agents)) {
    const res = await fetch(root + path, { headers: { 'user-agent': userAgent } });
    const html = await res.text();
    if (locale === 'zh-Hans' && agent === 'browser')
      await writeFile(new URL(`./evidence/${run}-home.html`, import.meta.url), html);
    const checks = {
      status: res.status === 200,
      indexHeader: demo || !/\bnoindex\b/i.test(res.headers.get('x-robots-tag') || ''),
      ...inspect(html, path, locale),
    };
    report.homes.push({ path, agent, bytes: Buffer.byteLength(html), checks });
    assert(Object.values(checks).every(Boolean), JSON.stringify({ path, agent, checks }));
  }
}
for (const city of catalog)
  for (const locale of locales) {
    const path = `/${locale}/weather/${city.slug}`;
    for (const [agent, userAgent] of Object.entries(agents)) {
      const res = await fetch(root + path, { headers: { 'user-agent': userAgent } });
      const html = await res.text();
      if (city === catalog[0] && locale === 'zh-Hans' && agent === 'browser')
        await writeFile(new URL(`./evidence/${run}-city.html`, import.meta.url), html);
      const checks = {
        status: res.status === 200,
        indexHeader: demo || !/\bnoindex\b/i.test(res.headers.get('x-robots-tag') || ''),
        ...inspect(html, path, locale, city),
      };
      report.pages.push({ path, agent, bytes: Buffer.byteLength(html), checks });
      assert(Object.values(checks).every(Boolean), JSON.stringify({ path, agent, checks }));
    }
  }
const invalid = await fetch(root + '/en/weather/does-not-exist');
assert.equal(invalid.status, 404);
report.invalid = invalid.status;
const explore = await fetch(root + '/en/explore?lat=25.0478&lon=121.5319').then((r) => r.text());
assert(explore.includes('noindex'));
assert(!explore.includes('application/ld+json'));
report.exploreNoindex = true;
report.exploreNoStructuredLocation = true;
const sitemap = await fetch(root + '/sitemap.xml').then((r) => r.text()),
  robots = await fetch(root + '/robots.txt').then((r) => r.text());
report.sitemapURLs = [...sitemap.matchAll(/<loc>/g)].length;
assert.equal(report.sitemapURLs, demo ? 0 : locales.length * (catalog.length + 1));
assert(demo || locales.every((l) => sitemap.includes(`<loc>${canonicalRoot}/${l}</loc>`)));
const rootRedirect = await fetch(root + '/', {
  redirect: 'manual',
  headers: { 'accept-language': 'ko-KR,ko;q=0.9' },
});
assert.equal(rootRedirect.status, 307);
assert.equal(new URL(rootRedirect.headers.get('location') || '', root).pathname, '/ko');
report.rootRedirect = { status: rootRedirect.status, target: '/ko', indexedHomes: locales };
assert(robots.includes('Allow: /') && !/^Disallow:\s*\/\s*$/m.test(robots));
assert(demo || robots.includes(canonicalRoot + '/sitemap.xml'));
report.robots = robots;
await mkdir(new URL('./evidence/', import.meta.url), { recursive: true });
await writeFile(
  new URL(`./evidence/${run}.json`, import.meta.url),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    pages: report.pages.length,
    homes: report.homes.length,
    sitemapURLs: report.sitemapURLs,
    invalid: report.invalid,
    exploreNoindex: report.exploreNoindex,
  }),
);
