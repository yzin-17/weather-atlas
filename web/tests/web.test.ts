import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, locales, browserLocale, placeURL, localPlace } from '../lib/catalog.ts';
import { labels, condition } from '../lib/ui-text.ts';
import { cityMeta } from '../lib/seo.ts';
import { localDay } from '../lib/format.ts';
test('all city/language pages self canonicalize and link reciprocally', () => {
  for (const city of catalog)
    for (const locale of locales) {
      const { alternates } = cityMeta(city, locale);
      assert.equal(alternates.canonical, alternates.languages[locale]);
      assert.ok(alternates.canonical.endsWith(placeURL(locale, localPlace(city, locale))));
      assert.equal(Object.keys(alternates.languages).length, 5);
    }
});
test('localized UI strings and WMO conditions exist in each supported language', () => {
  for (const locale of locales) {
    assert.ok(Object.values(labels(locale)).every((v) => typeof v === 'string' && v.trim()));
    assert.ok(condition(63, locale));
    assert.ok(condition(999, locale));
  }
});
test('language preference and destination civil dates stay independent', () => {
  assert.equal(browserLocale('zh-HK'), 'zh-Hant');
  assert.equal(browserLocale('ko-KR'), 'ko');
  const t = Date.parse('2025-01-01T23:01:00Z') / 1000;
  assert.equal(localDay(t, 'Asia/Seoul'), '2025-01-02');
  assert.equal(localDay(t, 'America/New_York'), '2025-01-01');
});
test('unlisted coordinates use temporary non-indexable explore links', () => {
  const url = placeURL('en', { lat: 10, lon: 11, name: 'A & B', id: 55 });
  assert.ok(url.startsWith('/en/explore?'));
  assert.equal(new URL(url, 'https://example.org').searchParams.get('name'), 'A & B');
});
