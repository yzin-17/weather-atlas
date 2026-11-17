import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { locales } from '../web/lib/catalog.ts';
import { labels } from '../web/lib/ui-text.ts';

const root = process.env.APP_URL || 'http://localhost:3300';
const run = process.env.QA_GRANT_RUN || 'location-grant';
assert(/^[a-z0-9-]+$/.test(run));
const rows: { locale: string; scenario: string; calls: number; waitedMs?: number }[] = [];
const errors: string[] = [];
const browser = await chromium.launch({ headless: true });
let failure: string | undefined;
try {
  for (const locale of locales) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      await context.addInitScript(() => {
        class LocationPermission extends EventTarget {
          state: PermissionState = 'prompt';
          grant() {
            this.state = 'granted';
            this.dispatchEvent(new Event('change'));
          }
        }
        const permission = new LocationPermission();
        Object.defineProperty(navigator, 'permissions', {
          value: { query: async () => permission },
        });
        window.__geoCount = 0;
        window.__grantLocation = () => permission.grant();
        navigator.geolocation.getCurrentPosition = (success, fail) => {
          window.__geoCount++;
          window.__pendingGeo = success;
          if (window.__geoCount === 1)
            queueMicrotask(() =>
              fail?.({
                code: 3,
                message: 'controlled timeout',
                PERMISSION_DENIED: 1,
                POSITION_UNAVAILABLE: 2,
                TIMEOUT: 3,
              }),
            );
          else
            success({
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
            });
        };
      });
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${root}/${locale}`);
      await page
        .locator('.notice')
        .filter({ hasText: labels(locale).locateFail })
        .waitFor();
      await page.evaluate(() => window.__grantLocation());
      await page.waitForURL(`**/${locale}/explore?**`, { timeout: 5000 });
      assert.equal(new URL(page.url()).searchParams.get('lat'), '25.0478');
      assert.equal(await page.evaluate(() => window.__geoCount), 2);
      rows.push({ locale, scenario: '首次定位失败后允许权限，自动重试并跳转原坐标', calls: 2 });
    } finally {
      await context.close();
    }
  }
  for (const scenario of ['pending', 'manual'] as const) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      await context.addInitScript((scenario) => {
        class LocationPermission extends EventTarget {
          state: PermissionState = 'prompt';
          grant() {
            this.state = 'granted';
            this.dispatchEvent(new Event('change'));
          }
        }
        const permission = new LocationPermission();
        Object.defineProperty(navigator, 'permissions', {
          value: { query: async () => permission },
        });
        window.__geoCount = 0;
        window.__grantLocation = () => permission.grant();
        navigator.geolocation.getCurrentPosition = (success, fail) => {
          window.__geoCount++;
          window.__pendingGeo = success;
          if (scenario === 'manual')
            queueMicrotask(() =>
              fail?.({
                code: 3,
                message: 'controlled timeout',
                PERMISSION_DENIED: 1,
                POSITION_UNAVAILABLE: 2,
                TIMEOUT: 3,
              }),
            );
        };
      }, scenario);
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${root}/zh-Hans`);
      await page.waitForFunction(() => typeof window.__pendingGeo === 'function');
      const started = Date.now();
      if (scenario === 'pending') {
        await page.waitForTimeout(12000);
        assert.equal(await page.locator('.notice').count(), 0);
        await page.getByText(labels('zh-Hans').locating, { exact: true }).waitFor();
      } else {
        await page.locator('.notice').waitFor();
        await page.locator('.finder').click();
        await page.getByRole('option').filter({ hasText: '东京' }).click();
        await page.waitForURL('**/zh-Hans/weather/tokyo-1850147');
      }
      await page.evaluate(() => {
        window.__grantLocation();
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
        });
      });
      if (scenario === 'pending') await page.waitForURL('**/zh-Hans/explore?**');
      else {
        await page.waitForLoadState('networkidle');
        assert.equal(new URL(page.url()).pathname, '/zh-Hans/weather/tokyo-1850147');
      }
      assert.equal(await page.evaluate(() => window.__geoCount), 1);
      rows.push({
        locale: 'zh-Hans',
        scenario:
          scenario === 'pending'
            ? '等待超过 12 秒再允许，首请求成功跳转且无重复请求'
            : '失败后已手选东京，迟到授权与位置均不覆盖选择',
        calls: 1,
        waitedMs: Date.now() - started,
      });
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
} catch (e) {
  failure = e instanceof Error ? e.message : String(e);
  throw e;
} finally {
  await browser.close();
  await writeFile(
    new URL(`./evidence/${run}-browser.json`, import.meta.url),
    JSON.stringify({ at: new Date().toISOString(), rows, errors, failure }, null, 2),
  );
}
console.log(JSON.stringify({ checks: rows.length, errors }));
