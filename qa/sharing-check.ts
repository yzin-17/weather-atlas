import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { labels } from '../web/lib/ui-text.ts';

const browser = await chromium.launch({ headless: true }),
  rows: { locale: string; url: string; title: string }[] = [];
try {
  const context = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
      viewport: { width: 390, height: 844 },
    }),
    page = await context.newPage();
  for (const locale of ['zh-Hans', 'zh-Hant', 'en', 'ko'] as const) {
    await page.goto(`http://127.0.0.1:3300/${locale}/weather/taipei-1668341`);
    await page.getByRole('button', { name: labels(locale).copyLink, exact: true }).click();
    const url = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(url, `http://127.0.0.1:3300/${locale}/weather/taipei-1668341`);
    await page.goto(url);
    assert.equal(await page.locator('html').getAttribute('lang'), locale);
    rows.push({ locale, url, title: await page.locator('h1').innerText() });
  }
} finally {
  await browser.close();
}
await writeFile(
  new URL('./evidence/sharing.json', import.meta.url),
  JSON.stringify({ at: new Date().toISOString(), rows }, null, 2),
);
console.log('四语台北城市链接实际复制和打开通过');
