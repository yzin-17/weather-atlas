import { chromium } from 'playwright-core';
import { requireValue } from '../web/lib/validation.ts';
import { errorInfo } from '../web/lib/errors.ts';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { catalog, locales } from '../web/lib/catalog.ts';
import { labels } from '../web/lib/ui-text.ts';

const root = process.env.APP_URL || 'http://127.0.0.1:3300';
const out = new URL('./evidence/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const report: {
  date: string;
  root: string;
  browser: string;
  layouts: { width: 1440 | 1024 | 768 | 390; overflow: false; errors: string[] }[];
  flow: {
    comparison?: '三轮追问、保留城市/日期/时段、台北依据预报查看通过';
    refreshSelection?: true;
    search?: '目录别名、无结果与快速连续输入通过；demo 不证明全球上游';
  };
  network: {
    homeTiles?: number;
    languageWeather?: number;
    mapStyles?: { locale: string; provider: string; urls: string[] }[];
    dragWeather?: number;
    confirmed?: { lat: number; lon: number };
  };
  errors: string[];
  failure?: string | undefined;
} = {
  date: new Date().toISOString(),
  root,
  browser: browser.version(),
  layouts: [],
  flow: {},
  network: {},
  errors: [],
};
try {
  for (const width of [1440, 1024, 768, 390] as const) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-US' }),
      page = await context.newPage();
    const failures: string[] = [];
    page.on('pageerror', (e) => failures.push(errorInfo(e).message));
    await page.goto(root + '/zh-Hans/weather/seoul-1835848');
    await page.locator('.hour').first().waitFor();
    assert.equal(await page.locator('.hour').count(), 24);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, 'overflow at ' + width);
    await page.screenshot({ path: new URL(`web-${width}.png`, out).pathname, fullPage: true });
    report.layouts.push({ width, overflow, errors: failures });
    assert.deepEqual(failures, []);
    await context.close();
  }
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: 'en-US',
    }),
    page = await context.newPage();
  const requests: { url: string; method: string }[] = [];
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method() }));
  page.on('pageerror', (e) => report.errors.push(errorInfo(e).message));
  await page.goto(root + '/zh-Hans/weather/seoul-1835848');
  await page.locator('.hour').first().waitFor();
  report.network.homeTiles = requests.filter((r) =>
    /\/tiles\/|tile.openstreetmap/.test(r.url),
  ).length;
  assert.equal(report.network.homeTiles, 0);
  for (const locale of locales) {
    await page.locator('#locale-select').selectOption(locale);
    await page.waitForURL('**/' + locale + '/weather/seoul-1835848');
    assert.equal(await page.locator('html').getAttribute('lang'), locale);
    await page.locator('.hour').first().waitFor();
  }
  report.network.languageWeather = requests.filter((r) => r.url.includes('/api/weather')).length;
  assert.equal(report.network.languageWeather, 0);
  await page.locator('#locale-select').selectOption('zh-Hans');
  await page.waitForURL('**/zh-Hans/weather/**');
  async function answerReady() {
    await page
      .locator('.answer')
      .first()
      .or(page.getByRole('button', { name: '刷新预报并重试', exact: true }))
      .waitFor();
    const refresh = page.getByRole('button', { name: '刷新预报并重试', exact: true });
    if (await refresh.isVisible()) await refresh.click();
    await page.locator('.answer').first().waitFor();
  }
  await page.locator('.ask-launcher').click();
  await page.locator('.prompts button').last().click();
  await answerReady();
  await page
    .getByRole('button', { name: labels('zh-Hans').followAfternoon, exact: true })
    .waitFor();
  assert((await page.locator('.answer').first().innerText()).includes('首尔'));
  assert((await page.locator('.answer').first().innerText()).includes('台北'));
  await page.getByRole('button', { name: labels('zh-Hans').followAfternoon, exact: true }).click();
  await answerReady();
  assert((await page.locator('.answer').first().innerText()).includes('12:00–17:00'));
  await page.getByRole('button', { name: labels('zh-Hans').followCold, exact: true }).click();
  await answerReady();
  assert((await page.locator('.answer').first().innerText()).includes('最低温度'));
  const taipeiButton = page.locator('.evidence button').filter({ hasText: '台北' }).first();
  await taipeiButton.click();
  assert((await page.getByTestId('comparison-forecast').innerText()).includes('Asia/Taipei'));
  await page.screenshot({ path: new URL('comparison-taipei.png', out).pathname, fullPage: true });
  report.flow.comparison = '三轮追问、保留城市/日期/时段、台北依据预报查看通过';
  await page.locator('.dialog-heading button').click();
  await page.locator('.finder').click();
  await page.locator('.place-actions button').last().click();
  await page.locator('.leaflet-container').waitFor();
  await page.locator('.leaflet-tile-loaded').first().waitFor();
  assert.equal(await page.locator('.map-dialog select').count(), 0);
  assert((await page.locator('.map-weather-chip').count()) > 0);
  const urls = await page.locator('.leaflet-tile-loaded').evaluateAll((imgs) =>
    imgs.map((i) => {
      if (!(i instanceof HTMLImageElement)) throw Error('Expected tile image');
      return i.src;
    }),
  );
  assert(
    urls.every(
      (url: string | string[]) =>
        url.includes('/api/map-tiles/') || url.includes('api.maptiler.com'),
    ),
  );
  report.network.mapStyles = [{ locale: 'zh-Hans', provider: '真实供图，跟随应用配置', urls }];
  await page.screenshot({ path: new URL('map-current.png', out).pathname });
  const before = requests.filter(
    (r) => r.url.includes('/api/weather') || r.url.includes('/explore?'),
  ).length;
  const box = await page.locator('.leaflet-container').boundingBox();
  await page.mouse.move(requireValue(box).x + 140, requireValue(box).y + 70);
  await page.mouse.down();
  await page.mouse.move(requireValue(box).x + 200, requireValue(box).y + 110, { steps: 10 });
  await page.mouse.up();
  report.network.dragWeather =
    requests.filter((r) => r.url.includes('/api/weather') || r.url.includes('/explore?')).length -
    before;
  assert.equal(report.network.dragWeather, 0);
  await page.getByLabel('纬度', { exact: true }).fill('25.0478');
  await page.getByLabel('经度', { exact: true }).fill('121.5319');
  await page.getByRole('button', { name: '查看天气', exact: true }).click();
  await page.waitForURL('**/explore?**');
  const selected = new URL(page.url());
  assert.equal(selected.searchParams.get('lat'), '25.0478');
  assert.equal(selected.searchParams.get('lon'), '121.5319');
  report.network.confirmed = { lat: 25.0478, lon: 121.5319 };
  await page.reload();
  assert.equal(new URL(page.url()).searchParams.get('lat'), '25.0478');
  await page.locator('.hour').first().waitFor();
  report.flow.refreshSelection = true;
  await page.getByRole('button', { name: '搜索地点', exact: true }).click();
  const search = page.getByPlaceholder('搜索全球城市或城镇');
  await search.fill('서울');
  await page.locator('.places button').first().waitFor();
  assert((await page.locator('.places').innerText()).includes('首尔'));
  await search.fill('台北');
  await page.locator('.places button').first().waitFor();
  assert((await page.locator('.places').innerText()).includes('台北'));
  await search.fill('zzzzunlikelycity');
  await page.getByText('没有匹配地点', { exact: true }).waitFor();
  await search.fill('서울');
  await search.fill('台北');
  await page.locator('.places button').first().waitFor();
  assert((await page.locator('.places').innerText()).includes('台北'));
  report.flow.search = '目录别名、无结果与快速连续输入通过；demo 不证明全球上游';
  await page.locator('.dialog-heading button').click();
  await context.close();
  assert.deepEqual(report.errors, []);
} catch (e) {
  report.failure = e instanceof Error ? e.stack : String(e);
  throw e;
} finally {
  await writeFile(new URL('browser-check.json', out), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(
    JSON.stringify({
      layouts: report.layouts,
      flow: report.flow,
      network: {
        homeTiles: report.network.homeTiles,
        languageWeather: report.network.languageWeather,
        dragWeather: report.network.dragWeather,
        confirmed: report.network.confirmed,
      },
      failure: report.failure || null,
    }),
  );
}
