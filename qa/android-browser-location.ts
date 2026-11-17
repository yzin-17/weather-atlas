import { chromium } from 'playwright-core';
import { requireValue } from '../web/lib/validation.ts';
import { errorInfo } from '../web/lib/errors.ts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222'),
  context = browser.contexts()[0],
  page = await context.newPage();
const cdp = await context.newCDPSession(page),
  origin = 'http://127.0.0.1:3300';
const report: {
  at: string;
  说明: 'Android 模拟器实际 Chrome；权限预先授予，坐标由 adb emu geo fix 设置。没有 CDP GeolocationOverride，不等于真机 GPS 或首次弹窗验收。';
  position?: { code?: number; message?: string; lat?: number; lon?: number };
  url?: string;
  passed?: true;
} = {
  at: new Date().toISOString(),
  说明: 'Android 模拟器实际 Chrome；权限预先授予，坐标由 adb emu geo fix 设置。没有 CDP GeolocationOverride，不等于真机 GPS 或首次弹窗验收。',
};
try {
  await cdp.send('Browser.grantPermissions', { origin, permissions: ['geolocation'] });
  await page.goto(origin + '/zh-Hans');
  report.position = await page.evaluate(
    () =>
      new Promise<{ code?: number; message?: string; lat?: number; lon?: number }>((resolve) =>
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
          (e) => resolve({ code: e.code, message: e.message }),
          { timeout: 12000, maximumAge: 0, enableHighAccuracy: true },
        ),
      ),
  );
  assert.equal(report.position.code, undefined, report.position.message || '');
  assert(Math.abs(requireValue(report.position.lat) - 25.0478) < 0.01);
  assert(Math.abs(requireValue(report.position.lon) - 121.5319) < 0.01);
  await page.waitForURL('**/explore?**', { timeout: 15000 });
  report.url = page.url();
  assert(report.url.includes('lat=25.0478'));
  report.passed = true;
} finally {
  await writeFile(
    new URL('./evidence/android-browser-location.json', import.meta.url),
    JSON.stringify(report, null, 2),
  );
  await page.close();
  await browser.close();
}
console.log(JSON.stringify(report));
