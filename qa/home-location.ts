import { chromium } from 'playwright-core';
import { errorInfo } from '../web/lib/errors.ts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { catalog, localPlace } from '../web/lib/catalog.ts';
import { labels } from '../web/lib/ui-text.ts';
import { type Place } from '../web/lib/types.ts';
import { type Page } from 'playwright-core';

const root = process.env.APP_URL || 'http://127.0.0.1:3300';
const insecure = process.env.QA_INSECURE_ORIGIN;
const run = process.env.QA_LOCATION_RUN || 'home-location';
assert(/^[a-z0-9-]+$/.test(run));
const browser = await chromium.launch({ headless: true });
const rows: (
    | { scenario: string; calls: number; fresh: boolean; locale: string }
    | { scenario: string; calls: number }
    | { scenario: string; manualSearch: boolean; oldCityNotRestored: boolean }
    | { scenario: string; manualSearch: boolean }
    | { scenario: string; passed: boolean }
  )[] = [],
  errors: string[] = [];
let failure: { name: string; message: string } | undefined;
async function context(options = {}) {
  const c = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'en-US',
    ...options,
  });
  c.on('page', (p) => p.on('pageerror', (e) => errors.push(errorInfo(e).message)));
  await c.route('**/api/places?**', (route) =>
    route.fulfill({ json: { places: [localPlace(catalog[2], 'zh-Hans')] } }),
  );
  return c;
}
async function manualTaipei(page: Page) {
  await page.locator('.finder').click();
  await page.getByPlaceholder(labels('zh-Hans').searchHint).fill('台北');
  await page.locator('.places button').filter({ hasText: '台北' }).first().click();
  await page.waitForURL(`**/zh-Hans/weather/${catalog[2].slug}`);
  await page.locator('.hour').first().waitFor();
}
const seedManual = (place: import('../web/lib/types.ts').Place) => {
  try {
    localStorage.setItem('wa.mode', JSON.stringify('manual'));
    localStorage.setItem('wa.last', JSON.stringify(place));
    localStorage.setItem('wa.language', JSON.stringify('en'));
  } catch {
    /* 初始空白文档可能是无法访问存储的 opaque origin。 */
  }
};
try {
  const native = await context({
    permissions: ['geolocation'],
    geolocation: { latitude: 25.0478, longitude: 121.5319 },
  });
  await native.addInitScript(seedManual, localPlace(catalog[3], 'en'));
  await native.addInitScript(() => {
    const get = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    window.__geoCalls = [];
    navigator.geolocation.getCurrentPosition = (success, fail, options) => {
      window.__geoCalls.push(options || {});
      get(success, fail, options);
    };
  });
  const current = await native.newPage();
  await current.goto(root + '/ko');
  await current.waitForURL('**/ko/explore?**');
  assert.equal(new URL(current.url()).searchParams.get('lat'), '25.0478');
  assert.equal(new URL(current.url()).searchParams.get('lon'), '121.5319');
  const first = await current.evaluate(() => window.__geoCalls);
  assert.equal(first.length, 1);
  assert.equal(first[0].maximumAge, 0);
  assert.equal(first[0].timeout, 10000);
  assert.equal(first[0].enableHighAccuracy, false);
  await current.locator('.brand').click();
  await current.waitForFunction(() => window.__geoCalls.length === 2);
  await current.waitForURL('**/ko/explore?**');
  assert.equal(new URL(current.url()).searchParams.get('lat'), '25.0478');
  rows.push({
    scenario: '已授权定位优先于旧 London；再次点击首页会重新定位',
    calls: 2,
    fresh: true,
    locale: 'ko',
  });
  await native.close();

  const prompt = await context();
  await prompt.addInitScript(() => {
    window.__geoCount = 0;
    Object.defineProperty(navigator, 'permissions', { value: undefined });
    navigator.geolocation.getCurrentPosition = (success) => {
      window.__geoCount++;
      window.__pendingGeo = success;
    };
  });
  const firstVisit = await prompt.newPage();
  await firstVisit.goto(root + '/zh-Hans');
  await firstVisit.waitForFunction(() => typeof window.__pendingGeo === 'function');
  await firstVisit.getByText(labels('zh-Hans').locating, { exact: true }).waitFor();
  await firstVisit.evaluate(() =>
    window.__pendingGeo({
      coords: {
        latitude: 25.0478,
        longitude: 121.5319,
        accuracy: 0,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON() {
          return { latitude: this.latitude, longitude: this.longitude };
        },
      },
      timestamp: Date.now(),
      toJSON() {
        return { coords: this.coords.toJSON(), timestamp: this.timestamp };
      },
    }),
  );
  await firstVisit.waitForURL('**/zh-Hans/explore?**');
  assert.equal(await firstVisit.evaluate(() => window.__geoCount), 1);
  rows.push({
    scenario: '首次进入会请求浏览器定位；没有 Permissions API 仍可继续授权流程',
    calls: 1,
  });
  await prompt.close();

  for (const code of [1, 2, 3, 0] as const) {
    const c = await context();
    await c.addInitScript(seedManual, localPlace(catalog[3], 'en'));
    await c.addInitScript((code) => {
      window.__geoCount = 0;
      if (!code) Object.defineProperty(navigator, 'geolocation', { value: undefined });
      else
        navigator.geolocation.getCurrentPosition = (_success, fail) => {
          window.__geoCount++;
          fail?.({
            code,
            message: 'controlled geolocation error',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          });
        };
    }, code);
    const page = await c.newPage();
    await page.goto(root + '/zh-Hans');
    await page
      .locator('.notice')
      .filter({ hasText: code === 1 ? labels('zh-Hans').denied : labels('zh-Hans').locateFail })
      .waitFor();
    assert.equal(new URL(page.url()).pathname, '/zh-Hans');
    assert.equal(await page.evaluate(() => window.__geoCount), code ? 1 : 0);
    await manualTaipei(page);
    rows.push({
      scenario: ['不支持定位', '拒绝', '不可用', '超时'][code],
      manualSearch: true,
      oldCityNotRestored: true,
    });
    await c.close();
  }
  if (insecure) {
    const c = await context();
    await c.addInitScript(seedManual, localPlace(catalog[3], 'en'));
    const page = await c.newPage();
    await page.goto(insecure + '/zh-Hans');
    assert.equal(await page.evaluate(() => isSecureContext), false);
    await page
      .locator('.notice')
      .filter({ hasText: labels('zh-Hans').locationSecure })
      .waitFor();
    assert.equal(new URL(page.url()).pathname, '/zh-Hans');
    await manualTaipei(page);
    rows.push({ scenario: '真实局域网 HTTP 为非安全来源', manualSearch: true });
    await c.close();
  }
  const race = await context();
  await race.addInitScript(seedManual, localPlace(catalog[3], 'en'));
  await race.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (success) => {
      window.__lateGeo = success;
    };
  });
  const manual = await race.newPage();
  await manual.goto(root + '/zh-Hans');
  await manual.waitForFunction(() => typeof window.__lateGeo === 'function');
  await manualTaipei(manual);
  await manual.evaluate(() =>
    window.__lateGeo({
      coords: {
        latitude: 40.7128,
        longitude: -74.006,
        accuracy: 0,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON() {
          return { latitude: this.latitude, longitude: this.longitude };
        },
      },
      timestamp: Date.now(),
      toJSON() {
        return { coords: this.coords.toJSON(), timestamp: this.timestamp };
      },
    }),
  );
  await manual.waitForLoadState('networkidle');
  assert.equal(new URL(manual.url()).pathname, `/zh-Hans/weather/${catalog[2].slug}`);
  rows.push({ scenario: '首页定位迟到不会覆盖本次手选台北', passed: true });
  await race.close();

  const deep = await context({
    permissions: ['geolocation'],
    geolocation: { latitude: 40.7128, longitude: -74.006 },
  });
  await deep.addInitScript(() => {
    window.__geoCount = 0;
    navigator.geolocation.getCurrentPosition = () => {
      window.__geoCount++;
    };
  });
  const city = await deep.newPage();
  await city.goto(root + '/en/weather/' + catalog[2].slug);
  await city.locator('.hour').first().waitFor();
  await city.reload();
  await city.locator('.hour').first().waitFor();
  assert.equal(await city.evaluate(() => window.__geoCount), 0);
  assert.equal(new URL(city.url()).pathname, '/en/weather/' + catalog[2].slug);
  rows.push({ scenario: '城市深链和刷新保持所选城市，不自动定位', calls: 0 });
  await deep.close();
  assert.deepEqual(errors, []);
} catch (error) {
  failure = { name: errorInfo(error).name, message: errorInfo(error).message };
  throw error;
} finally {
  await browser.close();
  await writeFile(
    new URL(`./evidence/${run}.json`, import.meta.url),
    JSON.stringify(
      { at: new Date().toISOString(), root, insecure, rows, errors, failure },
      null,
      2,
    ),
  );
}
console.log(JSON.stringify({ scenarios: rows.length, errors }));
