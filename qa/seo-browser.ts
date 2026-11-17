import { requireValue } from '../web/lib/validation.ts';
import { jsonObject, recordsAt } from './lib/json.ts';
import { chromium } from 'playwright-core';
import { errorInfo } from '../web/lib/errors.ts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { catalog, locales } from '../web/lib/catalog.ts';
import { labels } from '../web/lib/ui-text.ts';
import { ogLocales } from '../web/lib/seo.ts';

const base = process.env.APP_URL || 'http://127.0.0.1:3300';
const canonical = process.env.SITE_URL || 'http://localhost:3300';
const run = process.env.QA_SEO_BROWSER_RUN || 'seo-browser-final';
assert(/^[a-z0-9-]+$/.test(run));
const browser = await chromium.launch({ headless: true });
const rows: (
    | { path: string; canonical: string; types: unknown }
    | {
        locale: import('../web/lib/types.ts').Locale;
        canonical: string;
        language: unknown;
        scripts: number;
      }
    | { path: string; previousCitySchemaRemoved: boolean; previousCanonicalRemoved: boolean }
    | { scenario: string; passed: boolean }
  )[] = [],
  errors: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  page.on('pageerror', (e) => errors.push(errorInfo(e).message));
  await page.route('**/api/map-tiles/**', (route) => route.abort());
  for (const id of [1795565, 1819729]) {
    const city = requireValue(catalog.find((item) => item.id === id));
    for (const locale of locales) {
      const query = new URLSearchParams({
        lat: String(city.lat),
        lon: String(city.lon),
        id: String(id),
        name: city.names[0],
      });
      const response = await fetch(`${base}/${locale}/explore?${query}`, { redirect: 'manual' });
      assert.equal(response.status, 308);
      assert.equal(
        new URL(requireValue(response.headers.get('location')), base).pathname,
        `/${locale}/weather/${city.slug}`,
      );
      rows.push({ scenario: `${locale} ${city.slug} 旧坐标链接永久跳转`, passed: true });
    }
  }
  for (const kind of ['gps', 'pin']) {
    const response = await fetch(
      `${base}/zh-Hans/explore?lat=22.5455&lon=114.0683&id=1795565&kind=${kind}`,
      { redirect: 'manual' },
    );
    assert.equal(response.status, 200);
    const html = await response.text();
    assert(html.includes('noindex, nofollow'));
    assert(!html.includes('rel="canonical"'));
    assert(!html.includes('application/ld+json'));
    rows.push({ scenario: `${kind} 保留坐标与 noindex`, passed: true });
  }
  await page.goto(base + '/en');
  await page.waitForFunction(() => !!document.querySelector('script[type="application/ld+json"]'));
  assert.equal(
    await page.locator('head link[rel=canonical]').getAttribute('href'),
    canonical + '/en',
  );
  rows.push({
    path: '/en',
    canonical: canonical + '/en',
    types: recordsAt(
      jsonObject(await page.locator('script[type="application/ld+json"]').innerText()),
      '@graph',
    ).map((node) => node['@type']),
  });
  await page.goto(base + '/en/weather/' + catalog[0].slug);
  await page.locator('.hour').first().waitFor();
  for (const locale of locales) {
    await page.locator('#locale-select').selectOption(locale);
    await page.waitForURL(`**/${locale}/weather/${catalog[0].slug}`);
    const url = `${canonical}/${locale}/weather/${catalog[0].slug}`;
    await page.waitForFunction(
      (expected) =>
        document.querySelector<HTMLLinkElement>('head link[rel=canonical]')?.href === expected,
      url,
    );
    assert.equal(await page.locator('script[type="application/ld+json"]').count(), 1);
    const graph = recordsAt(
      jsonObject(await page.locator('script[type="application/ld+json"]').innerText()),
      '@graph',
    );
    const webPage = graph.find((n) => n['@type'] === 'WebPage');
    assert.equal(requireValue(webPage).url, url);
    assert.equal(requireValue(webPage).inLanguage, locale);
    assert.equal(
      await page.locator('meta[property="og:locale"]').getAttribute('content'),
      ogLocales[locale],
    );
    assert.equal(
      await page.locator('meta[property="og:image"]').getAttribute('content'),
      canonical + '/social-image',
    );
    assert.equal(
      requireValue(graph.find((n) => n['@type'] === 'Place')).name,
      await page.locator('h1').innerText(),
    );
    rows.push({ locale, canonical: url, language: requireValue(webPage).inLanguage, scripts: 1 });
  }
  await page.locator('.city-row a[href="/ko/weather/shenzhen-1795565"]').click();
  await page.waitForURL('**/ko/weather/shenzhen-1795565');
  await page.waitForFunction(() =>
    document
      .querySelector<HTMLLinkElement>('head link[rel=canonical]')
      ?.href.endsWith('/ko/weather/shenzhen-1795565'),
  );
  assert.equal(await page.locator('script[type="application/ld+json"]').count(), 1);
  assert.equal(await page.locator('meta[name=robots]').getAttribute('content'), 'index, follow');
  rows.push({ scenario: '默认深圳城市链接通过客户端导航更新 canonical 与 JSON-LD', passed: true });
  await page.goBack();
  await page.waitForURL(`**/ko/weather/${catalog[0].slug}`);
  await page.locator('.finder').click();
  await page
    .locator('.place-actions')
    .getByRole('button', { name: labels('ko').map, exact: true })
    .click();
  const fields = page.locator('.coordinate-entry input');
  await fields.nth(0).fill('10');
  await fields.nth(1).fill('11');
  await fields.nth(1).blur();
  await page.locator('.map-selection .primary').click();
  await page.waitForURL('**/explore?**');
  await page.waitForFunction(() =>
    document.querySelector<HTMLMetaElement>('meta[name=robots]')?.content.includes('noindex'),
  );
  assert.equal(await page.locator('script[type="application/ld+json"]').count(), 0);
  assert.equal(await page.locator('head link[rel=canonical]').count(), 0);
  rows.push({ path: '/explore', previousCitySchemaRemoved: true, previousCanonicalRemoved: true });
  await page.goBack();
  await page.waitForURL(`**/ko/weather/${catalog[0].slug}`);
  await page.waitForFunction(
    (expected) =>
      document.querySelector<HTMLLinkElement>('head link[rel=canonical]')?.href === expected,
    `${canonical}/ko/weather/${catalog[0].slug}`,
  );
  assert.equal(await page.locator('meta[name=robots]').getAttribute('content'), 'index, follow');
  assert.equal(await page.locator('script[type="application/ld+json"]').count(), 1);
  await page.goForward();
  await page.waitForURL('**/explore?**');
  await page.waitForFunction(() =>
    document.querySelector<HTMLMetaElement>('meta[name=robots]')?.content.includes('noindex'),
  );
  assert.equal(await page.locator('head link[rel=canonical]').count(), 0);
  assert.equal(await page.locator('script[type="application/ld+json"]').count(), 0);
  rows.push({
    scenario: 'browser back/forward restores index metadata and removes private-page residue',
    passed: true,
  });
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
await writeFile(
  new URL(`./evidence/${run}.json`, import.meta.url),
  JSON.stringify({ at: new Date().toISOString(), rows, errors }, null, 2),
);
console.log('入口、城市四语客户端导航与坐标页元数据清理通过');
