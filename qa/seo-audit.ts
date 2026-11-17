import { jsonObject, recordsAt, jsonPath } from './lib/json.ts';
import type { Locale, CatalogCity } from '../web/lib/types.ts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { catalog, locales, localPlace } from '../web/lib/catalog.ts';
import { ogLocales } from '../web/lib/seo.ts';

const root = process.env.APP_URL || 'http://127.0.0.1:3300';
const base = process.env.SITE_URL || 'http://localhost:3300';
const run = process.env.QA_AUDIT_RUN || 'seo-audit-final';
const enforce = process.env.QA_AUDIT_ASSERT !== '0';
assert(/^[a-z0-9-]+$/.test(run));
const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
const attrs = (text: string) =>
  Object.fromEntries(
    [...text.matchAll(/([\w:-]+)=(['"])([\s\S]*?)\2/g)].map((m) => [
      m[1].toLowerCase(),
      decode(m[3]),
    ]),
  );
const tags = (html: string, tag: string) =>
  [...html.matchAll(new RegExp(`<${tag}\\b([^>]+)>`, 'gi'))].map((m) => attrs(m[1]));
const report: {
  at: string;
  root: string;
  base: string;
  pages: {
    path: string;
    agent: string;
    bytes: number;
    checks: {
      status: boolean;
      oneTitle: boolean;
      description: boolean;
      oneCanonical: boolean;
      headRobots: boolean;
      noDuplicateRobots: boolean;
      noHeaderBlock: boolean;
      oneH1: boolean;
      readableForecast: boolean;
      language: boolean;
      alternates: boolean;
      ogURL: boolean;
      ogLocale: boolean;
      ogOtherLocales: boolean;
      preview: boolean;
      twitter: boolean;
      favicon: boolean;
      schema: boolean;
      schemaPlace: boolean;
    };
  }[];
  variants: (
    | {
        path: '/en?utm_source=a' | '/en/weather/seoul-1835848?utm_source=a&lat=25&name=Other';
        status: number;
        canonical: string;
      }
    | {
        path:
          | '/en/weather/missing'
          | '/fr'
          | '/fr/weather/seoul-1835848'
          | '/en/explore'
          | '/en/explore?lat=999&lon=4'
          | '/en/explore?lat=25&lat=30&lon=121';
        status: number;
        noindex: boolean;
      }
    | { path: string; status: number; noindex: boolean }
    | { path: string; status: number; target: string | null }
    | { agent: string; path: string; status: number }
  )[];
  roots: {
    language:
      | 'fr-FR,ko;q=0.9,en;q=0.8'
      | 'ko;q=0.2,en;q=0.9'
      | 'zh-TW,zh;q=0.8'
      | 'en;q=0,ko;q=0.9'
      | 'en;q=0.5,*;q=1'
      | 'fr-FR ; q=0.8, ko-KR ; q=0.9';
    status: number;
    target: string | null;
    vary: string | null;
  }[];
  resources: (
    | {
        path: '/api/ask' | '/api/weather?lat=999&lon=4' | '/api/vitals';
        status: number;
        indexHeader: string | null;
      }
    | {
        width?: number | undefined;
        height?: number | undefined;
        path: '/social-image' | '/icon.svg';
        status: number;
        type: string | null;
        bytes: number;
      }
    | {
        path:
          | '/social-image'
          | '/en'
          | '/sitemap.xml'
          | '/robots.txt'
          | '/en/weather/seoul-1835848';
        method: string;
        status: number;
        bytes: number;
        type: string | null;
      }
  )[];
  findings: string[];
  sitemap?: { status: number; entries: number; unique: number };
  robots?: string;
} = {
  at: new Date().toISOString(),
  root,
  base,
  pages: [],
  variants: [],
  roots: [],
  resources: [],
  findings: [],
};
const check = (condition: boolean | undefined, label: string) => {
  if (!condition) report.findings.push(label);
};
const agents = {
  browser: 'Mozilla/5.0 WeatherAtlas-SEO-Audit',
  googlebot: 'Googlebot',
  share: 'Twitterbot/1.0',
};
const pages: { locale: Locale; city?: CatalogCity; path: string }[] = locales.flatMap((locale) => [
  { locale, path: `/${locale}` },
  ...catalog.map((city) => ({ locale, city, path: `/${locale}/weather/${city.slug}` })),
]);
for (const { locale, city, path } of pages)
  for (const [agent, userAgent] of Object.entries(agents)) {
    const res = await fetch(root + path, { headers: { 'user-agent': userAgent } });
    const html = await res.text(),
      head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
    const meta = tags(head, 'meta'),
      links = tags(head, 'link');
    const values = (key: string) =>
      meta.filter((m) => m.name === key || m.property === key).map((m) => m.content);
    const canonical = links.filter((l) => l.rel === 'canonical');
    const jsonBlocks = [
      ...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi),
    ];
    const graph = jsonBlocks.length === 1 ? recordsAt(jsonObject(jsonBlocks[0][1]), '@graph') : [];
    const schemaPage = graph.find((n) => n['@type'] === 'WebPage'),
      place = graph.find((n) => n['@type'] === 'Place');
    const expected = base + path;
    const checks = {
      status: res.status === 200,
      oneTitle: (head.match(/<title>/g) || []).length === 1,
      description: values('description').length === 1 && !!values('description')[0],
      oneCanonical: canonical.length === 1 && canonical[0].href === expected,
      headRobots: values('robots').length === 1 && values('robots')[0] === 'index, follow',
      noDuplicateRobots: tags(html, 'meta').filter((m) => m.name === 'robots').length === 1,
      noHeaderBlock: !/noindex/i.test(res.headers.get('x-robots-tag') || ''),
      oneH1: (html.match(/<h1\b/g) || []).length === 1,
      readableForecast:
        tags(html, '(?:button|div)').filter((n) => n.class?.split(' ').includes('hour')).length ===
        24,
      language: html.includes(`<html lang="${locale}"`),
      alternates:
        links.filter((l) => l.rel === 'alternate' && l.hreflang).length === 5 &&
        [...locales, 'x-default'].every((l) =>
          links.some(
            (n) =>
              n.hreflang === l &&
              n.href ===
                `${base}/${l === 'x-default' ? 'en' : l}${city ? `/weather/${city.slug}` : ''}`,
          ),
        ),
      ogURL: values('og:url').length === 1 && values('og:url')[0] === expected,
      ogLocale: values('og:locale')[0] === ogLocales[locale],
      ogOtherLocales: locales
        .filter((l) => l !== locale)
        .every((l) => values('og:locale:alternate').includes(ogLocales[l])),
      preview:
        values('og:image')[0] === base + '/social-image' &&
        values('og:image:width')[0] === '1200' &&
        values('og:image:height')[0] === '630' &&
        !!values('og:image:alt')[0],
      twitter:
        values('twitter:card')[0] === 'summary_large_image' &&
        values('twitter:image')[0] === base + '/social-image' &&
        !!values('twitter:image:alt')[0],
      favicon: links.some((l) => l.rel === 'icon' && l.href?.startsWith('/icon.svg')),
      schema:
        graph.length === (city ? 3 : 2) &&
        schemaPage?.url === expected &&
        schemaPage?.inLanguage === locale &&
        (schemaPage?.isPartOf && jsonPath(schemaPage.isPartOf, '@id')) === base + '/#website',
      schemaPlace: city
        ? place?.name === localPlace(city, locale).name &&
          (place?.geo && jsonPath(place.geo, 'latitude')) === city.lat &&
          (place?.geo && jsonPath(place.geo, 'longitude')) === city.lon
        : !place,
    };
    for (const [key, value] of Object.entries(checks)) check(value, `${agent} ${path}: ${key}`);
    report.pages.push({ path, agent, bytes: Buffer.byteLength(html), checks });
    if (agent === 'browser' && locale === 'zh-Hans' && (!city || city === catalog[0]))
      await writeFile(
        new URL(`./evidence/${run}-${city ? 'city' : 'home'}.html`, import.meta.url),
        html,
      );
  }
for (const path of [
  '/en?utm_source=a',
  '/en/weather/seoul-1835848?utm_source=a&lat=25&name=Other',
] as const) {
  const res = await fetch(root + path),
    html = await res.text();
  const canonical = tags(html.split('</head>')[0], 'link').filter((l) => l.rel === 'canonical');
  check(
    res.status === 200 && canonical.length === 1 && canonical[0].href === base + path.split('?')[0],
    path + ': query canonical',
  );
  report.variants.push({ path, status: res.status, canonical: canonical[0]?.href });
}
for (const path of [
  '/en/weather/missing',
  '/fr',
  '/fr/weather/seoul-1835848',
  '/en/explore',
  '/en/explore?lat=999&lon=4',
  '/en/explore?lat=25&lat=30&lon=121',
] as const) {
  const res = await fetch(root + path),
    html = await res.text();
  check(
    res.status === 404 && /name="robots" content="[^"]*noindex/.test(html),
    path + ': 404 noindex',
  );
  check(!html.includes('application/ld+json'), path + ': error schema');
  report.variants.push({ path, status: res.status, noindex: html.includes('noindex') });
}
const point = '/en/explore?lat=25.0478&lon=121.5319';
const privateRes = await fetch(root + point),
  privateHTML = await privateRes.text();
check(
  privateRes.status === 200 &&
    /name="robots" content="noindex, nofollow"/.test(privateHTML) &&
    !privateHTML.includes('application/ld+json') &&
    !privateHTML.includes('rel="canonical"'),
  'coordinate index/schema/canonical',
);
report.variants.push({
  path: point,
  status: privateRes.status,
  noindex: privateHTML.includes('noindex'),
});
const trailing = await fetch(root + '/en/', { redirect: 'manual' });
check(
  trailing.status === 308 &&
    new URL(trailing.headers.get('location') || '', root).pathname === '/en',
  'trailing slash',
);
report.variants.push({
  path: '/en/',
  status: trailing.status,
  target: trailing.headers.get('location'),
});
for (const [language, target] of [
  ['fr-FR,ko;q=0.9,en;q=0.8', '/ko'],
  ['ko;q=0.2,en;q=0.9', '/en'],
  ['zh-TW,zh;q=0.8', '/zh-Hant'],
  ['en;q=0,ko;q=0.9', '/ko'],
  ['en;q=0.5,*;q=1', '/zh-Hans'],
  ['fr-FR ; q=0.8, ko-KR ; q=0.9', '/ko'],
] as const) {
  const res = await fetch(root + '/', {
    redirect: 'manual',
    headers: { 'accept-language': language },
  });
  check(
    res.status === 307 &&
      new URL(res.headers.get('location') || '', root).pathname === target &&
      /accept-language/i.test(res.headers.get('vary') || ''),
    'root negotiation: ' + language,
  );
  report.roots.push({
    language,
    status: res.status,
    target: res.headers.get('location'),
    vary: res.headers.get('vary'),
  });
}
for (const path of ['/api/weather?lat=999&lon=4', '/api/ask', '/api/vitals'] as const) {
  const res = await fetch(root + path);
  await res.arrayBuffer();
  check(/noindex/i.test(res.headers.get('x-robots-tag') || ''), 'API index header: ' + path);
  report.resources.push({ path, status: res.status, indexHeader: res.headers.get('x-robots-tag') });
}
const siteRes = await fetch(root + '/sitemap.xml'),
  sitemap = await siteRes.text();
const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
  url: m[1].match(/<loc>(.*?)<\/loc>/)?.[1],
  links: tags(m[1], 'xhtml:link'),
}));
check(
  siteRes.status === 200 && /xml/.test(siteRes.headers.get('content-type') || ''),
  'sitemap MIME/status',
);
check(
  entries.length === pages.length && new Set(entries.map((e) => e.url)).size === pages.length,
  `sitemap distinct ${pages.length}`,
);
for (const entry of entries) {
  const info = pages.find((p) => base + p.path === entry.url);
  check(!!info, 'sitemap canonical URL: ' + entry.url);
  check(
    entry.links.length === 5 &&
      [...locales, 'x-default'].every((l) =>
        entry.links.some(
          (n) =>
            n.hreflang === l &&
            n.href ===
              `${base}/${l === 'x-default' ? 'en' : l}${info?.city ? `/weather/${info.city.slug}` : ''}`,
        ),
      ),
    'sitemap alternate graph: ' + entry.url,
  );
}
report.sitemap = {
  status: siteRes.status,
  entries: entries.length,
  unique: new Set(entries.map((e) => e.url)).size,
};
const robotsRes = await fetch(root + '/robots.txt'),
  robots = await robotsRes.text();
check(
  robotsRes.status === 200 &&
    /text\/plain/.test(robotsRes.headers.get('content-type') || '') &&
    !/^Disallow:\s*\/\s*$/m.test(robots) &&
    robots.includes(base + '/sitemap.xml'),
  'robots',
);
report.robots = robots;
for (const path of ['/social-image', '/icon.svg'] as const) {
  const res = await fetch(root + path),
    data = Buffer.from(await res.arrayBuffer());
  const png = path === '/social-image';
  const valid =
    res.status === 200 &&
    (png
      ? res.headers.get('content-type')?.startsWith('image/png') &&
        data.length > 24 &&
        data.subarray(1, 4).toString() === 'PNG' &&
        data.readUInt32BE(16) === 1200 &&
        data.readUInt32BE(20) === 630
      : res.headers.get('content-type')?.startsWith('image/svg+xml') &&
        data.toString().includes('viewBox="0 0 40 40"'));
  check(valid, 'image resource: ' + path);
  report.resources.push({
    path,
    status: res.status,
    type: res.headers.get('content-type'),
    bytes: data.length,
    ...(png && valid ? { width: 1200, height: 630 } : {}),
  });
  if (png && valid) await writeFile(new URL(`./evidence/${run}-social.png`, import.meta.url), data);
}
const host = await fetch(root + '/en', { headers: { host: 'untrusted.example' } }).then((r) =>
  r.text(),
);
check(
  tags(host.split('</head>')[0], 'link').some(
    (l) => l.rel === 'canonical' && l.href === base + '/en',
  ),
  'configured canonical ignores untrusted Host',
);
for (const path of [
  '/en',
  '/en/weather/seoul-1835848',
  '/sitemap.xml',
  '/robots.txt',
  '/social-image',
] as const) {
  const res = await fetch(root + path, { method: 'HEAD' });
  const bytes = (await res.arrayBuffer()).byteLength;
  check(res.status === 200 && bytes === 0, 'HEAD response: ' + path);
  report.resources.push({
    path,
    method: 'HEAD',
    status: res.status,
    bytes,
    type: res.headers.get('content-type'),
  });
}
const bing = await fetch(root + '/ko/weather/seoul-1835848', {
  headers: { 'user-agent': 'bingbot' },
});
const bingHTML = await bing.text();
check(
  bing.status === 200 &&
    tags(bingHTML.split('</head>')[0], 'link').some(
      (l) => l.rel === 'canonical' && l.href === base + '/ko/weather/seoul-1835848',
    ) &&
    bingHTML.includes('application/ld+json'),
  'Bingbot raw metadata',
);
report.variants.push({ agent: 'bingbot', path: '/ko/weather/seoul-1835848', status: bing.status });
await writeFile(
  new URL(`./evidence/${run}.json`, import.meta.url),
  JSON.stringify(report, null, 2),
);
if (report.findings.length)
  await writeFile(
    new URL(`./evidence/${run}-failed-${Date.now()}.json`, import.meta.url),
    JSON.stringify(report, null, 2),
  );
console.log(
  JSON.stringify({
    pages: report.pages.length,
    findings: report.findings,
    sitemap: report.sitemap,
  }),
);
if (enforce) assert.deepEqual(report.findings, []);
