import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { labels } from '../web/lib/ui-text.ts';

const origin = process.env.APP_URL || 'http://localhost:3304';
const browser = await chromium.launch({ headless: true }),
  checks: (
    | '首次首页在 prompt 状态主动调用定位授权接口'
    | '迟到授权结果不覆盖手选，手选偏好恢复不再自动请求'
    | '城市深链不自动请求；点击使用位置后申请并导航'
    | '不支持 Permissions API 时仍能主动申请'
    | '已拒绝时说明浏览器设置恢复；用户重试仍调用定位'
    | string
  )[] = [];
async function setup(state: PermissionState = 'prompt', withoutPermissions = false) {
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width: 390, height: 844 },
  });
  await context.addInitScript(
    ({ state, withoutPermissions }) => {
      window.__locationCalls = 0;
      if (withoutPermissions) Object.defineProperty(navigator, 'permissions', { value: undefined });
      else
        navigator.permissions.query = async () =>
          Object.assign(new EventTarget(), { state, name: 'geolocation' as const, onchange: null });
      navigator.geolocation.getCurrentPosition = (success, failure) => {
        window.__locationCalls++;
        if (state === 'denied')
          failure?.({
            code: 1,
            message: 'controlled geolocation error',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          });
        else window.__locationSuccess = success;
      };
    },
    { state, withoutPermissions },
  );
  return { context, page: await context.newPage() };
}
try {
  {
    const { context, page } = await setup();
    await page.goto(origin + '/zh-Hans');
    await page.waitForFunction(() => window.__locationCalls === 1);
    checks.push('首次首页在 prompt 状态主动调用定位授权接口');
    await page.getByRole('button', { name: '搜索地点', exact: true }).click();
    await page.getByPlaceholder(labels('zh-Hans').searchHint).fill('台北');
    await page.locator('.places button').first().click();
    await page.waitForURL('**/weather/taipei-1668341');
    await page.evaluate(() =>
      window.__locationSuccess({
        coords: {
          latitude: 37.566,
          longitude: 126.9784,
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
    assert(page.url().includes('/weather/taipei-1668341'));
    await page.goto(origin + '/zh-Hans');
    await page.waitForURL('**/weather/taipei-1668341');
    assert.equal(await page.evaluate(() => window.__locationCalls), 0);
    checks.push('迟到授权结果不覆盖手选，手选偏好恢复不再自动请求');
    await context.close();
  }
  {
    const { context, page } = await setup();
    await page.goto(origin + '/zh-Hans/weather/seoul-1835848');
    await page.locator('.hour').first().waitFor();
    assert.equal(await page.evaluate(() => window.__locationCalls), 0);
    await page.getByRole('button', { name: '搜索地点', exact: true }).click();
    await page.getByRole('button', { name: '使用我的位置', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__locationCalls), 1);
    await page.evaluate(() =>
      window.__locationSuccess({
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
    await page.waitForURL('**/explore?**');
    assert(new URL(page.url()).searchParams.get('lat') === '25.0478');
    checks.push('城市深链不自动请求；点击使用位置后申请并导航');
    await context.close();
  }
  {
    const { context, page } = await setup('prompt', true);
    await page.goto(origin + '/zh-Hans');
    await page.waitForFunction(() => window.__locationCalls === 1);
    checks.push('不支持 Permissions API 时仍能主动申请');
    await context.close();
  }
  {
    const { context, page } = await setup('denied');
    await page.goto(origin + '/zh-Hans');
    await page.getByText(labels('zh-Hans').denied, { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__locationCalls), 0);
    await page.getByRole('button', { name: '搜索地点', exact: true }).click();
    await page.getByRole('button', { name: '使用我的位置', exact: true }).click();
    await page.getByText(labels('zh-Hans').denied, { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__locationCalls), 1);
    checks.push('已拒绝时说明浏览器设置恢复；用户重试仍调用定位');
    await context.close();
  }
  const ip = Object.values(networkInterfaces())
    .flat()
    .find((n) => n?.family === 'IPv4' && !n.internal)?.address;
  assert(ip);
  const lan = new URL(origin);
  lan.hostname = ip;
  for (const locale of ['zh-Hans', 'zh-Hant', 'en', 'ko'] as const) {
    const context = await browser.newContext(),
      page = await context.newPage(),
      t = labels(locale);
    await page.goto(lan.origin + `/${locale}/weather/seoul-1835848`);
    assert.equal(await page.evaluate(() => isSecureContext), false);
    await page.getByRole('button', { name: t.find, exact: true }).click();
    await page.getByRole('button', { name: t.here, exact: true }).click();
    await page.getByText(t.locationSecure, { exact: true }).waitFor();
    checks.push(`${locale} 局域网 HTTP 明确提示 HTTPS 要求`);
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(
    new URL('./evidence/location-permissions.json', import.meta.url),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        origin,
        说明: '权限状态与返回值受控注入，验证授权接口调用及竞态；HTTP 安全上下文为实际浏览器判断，不代表真实 GPS 或人工点击系统授权弹窗。',
        checks,
      },
      null,
      2,
    ),
  );
}
console.log(JSON.stringify({ checks: checks.length, results: checks }));
