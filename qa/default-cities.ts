import { readForecast } from './lib/json.ts';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { defaultCities, localPlace, catalog, placeURL, locales } from '../web/lib/catalog.ts';
import { labels } from '../web/lib/ui-text.ts';

const origin = process.env.APP_URL || 'http://localhost:3304',
  browser = await chromium.launch({ headless: true }),
  checks: ({ locale: string; city: unknown; timezone: string | number } | { 说明: string })[] = [];
try {
  for (const locale of locales) {
    const context = await browser.newContext(),
      page = await context.newPage(),
      t = labels(locale);
    const names = defaultCities.map((c) => localPlace(c, locale).name);
    await page.goto(origin + `/${locale}/weather/seoul-1835848`);
    await page.locator('.city-label b').first().waitFor();
    assert.deepEqual(
      await page.locator('.city-label b').allTextContents(),
      defaultCities
        .filter((city) => city.id !== 1835848)
        .map((city) => localPlace(city, locale).name),
    );
    for (const [index, city] of defaultCities.entries()) {
      const timezone = city.timezone;
      await page.getByRole('button', { name: t.find, exact: true }).click();
      await page.locator('.places button b').first().waitFor();
      assert.deepEqual(await page.locator('.places button b').allTextContents(), names);
      await page.locator('.places button').nth(index).click();
      await page.waitForURL('**' + placeURL(locale, localPlace(defaultCities[index], locale)));
      await page.waitForFunction(
        (name: string | undefined) => document.querySelector('h1')?.textContent === name,
        names[index],
      );
      await page.getByText(new RegExp(timezone)).first().waitFor();
      const f = await fetch(`${origin}/api/weather?lat=${city.lat}&lon=${city.lon}`).then((r) =>
        readForecast(r),
      );
      assert.equal(f.timezone, timezone);
      assert.equal(f.hours.length, 24);
      assert.equal(f.days.length, 7);
      checks.push({ locale, city: names[index], timezone });
    }
    await context.close();
  }
  for (const saved of [[localPlace(catalog[2], 'zh-Hans')], []] as const) {
    const context = await browser.newContext(),
      page = await context.newPage();
    await context.addInitScript(
      (saved) => localStorage.setItem('wa.saved', JSON.stringify(saved)),
      saved,
    );
    await page.goto(origin + '/zh-Hans/weather/seoul-1835848');
    await page.waitForFunction(
      (count: number) => document.querySelectorAll('.city-label b').length === count,
      saved.length,
    );
    assert.deepEqual(
      await page.locator('.city-label b').allTextContents(),
      saved.map((p) => p.name),
    );
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('wa.saved') || 'null')),
      saved,
    );
    checks.push({ 说明: saved.length ? '保留已有收藏' : '保留用户主动清空的列表' });
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(
    new URL('./evidence/default-cities.json', import.meta.url),
    JSON.stringify({ at: new Date().toISOString(), origin, checks }, null, 2),
  );
}
console.log(JSON.stringify({ checks: checks.length, passed: true }));
