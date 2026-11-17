import { jsonObject, textAt } from './lib/json.ts';
import { decode } from '../web/lib/validation.ts';
import { validSnapshot } from '../web/lib/client-forecast.ts';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { X509Certificate } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

const runtime = jsonObject(
  await readFile(
    path.join(os.homedir(), 'Library/Application Support/Weather Atlas/https/runtime.json'),
    'utf8',
  ),
);
const report: {
  at: string;
  origin: unknown;
  physicalPhoneVerified: false;
  checks: (
    | '证书正常校验通过'
    | '移动视口为安全上下文'
    | '定位 API 可用'
    | '无示例模式提示'
    | '真实全球搜索'
    | '授权后定位进入坐标天气页'
    | '手机下载根证书指纹一致'
  )[];
  security?: { secure: boolean; geolocation: boolean; permission: PermissionState };
  realWeather?: {
    source: unknown;
    timezone: unknown;
    fetchedAt: unknown;
    stale: unknown;
    current: unknown;
  };
  searchResults?: number;
  location?: { method: string; status: number; timezone: unknown; source: unknown };
} = {
  at: new Date().toISOString(),
  origin: textAt(runtime, 'origin'),
  physicalPhoneVerified: false,
  checks: [],
};
// 保留默认 TLS 校验；不启用 ignoreHTTPSErrors 或忽略证书参数。
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(runtime.origin + '/zh-Hans/weather/seoul-1835848');
  const security = await page.evaluate(async () => ({
    secure: window.isSecureContext,
    geolocation: !!navigator.geolocation,
    permission: (await navigator.permissions.query({ name: 'geolocation' })).state,
  }));
  assert(security.secure && security.geolocation);
  report.security = security;
  const real = await page.evaluate(async () => {
    const res = await fetch('/api/weather?lat=-33.86785&lon=151.20732');
    const data: unknown = await res.json();
    return { status: res.status, data };
  });
  assert.equal(real.status, 200);
  const weatherData = decode(real.data, validSnapshot);
  assert.equal(weatherData.source, 'open-meteo');
  assert.equal(weatherData.timezone, 'Australia/Sydney');
  assert.equal(weatherData.hours.length, 24);
  assert.equal(weatherData.days.length, 7);
  report.realWeather = {
    source: weatherData.source,
    timezone: weatherData.timezone,
    fetchedAt: weatherData.fetchedAt,
    stale: weatherData.stale,
    current: weatherData.current,
  };
  await page.getByRole('button', { name: '搜索地点', exact: true }).click();
  assert.equal(await page.getByText('示例模式仅包含目录城市。', { exact: true }).count(), 0);
  await page.getByPlaceholder('搜索全球城市或城镇').fill('Sydney');
  await page.locator('.places button').first().waitFor();
  report.searchResults = await page.locator('.places button').count();
  assert(report.searchResults > 0);
  await context.grantPermissions(['geolocation'], { origin: textAt(runtime, 'origin') });
  await context.setGeolocation({ latitude: 25.0478, longitude: 121.5319 });
  await page.getByRole('button', { name: '使用我的位置', exact: true }).click();
  await page.waitForURL(
    (u: URL) => u.pathname.endsWith('/explore') && u.searchParams.get('lat') === '25.0478',
  );
  const located = await page.evaluate(async () => {
    const r = await fetch('/api/weather?lat=25.0478&lon=121.5319');
    const data: unknown = await r.json();
    return { status: r.status, data };
  });
  assert.equal(located.status, 200);
  const weather = decode(located.data, validSnapshot);
  assert.equal(weather.timezone, 'Asia/Taipei');
  assert.equal(weather.source, 'open-meteo');
  report.location = {
    method: '浏览器受控模拟坐标，真实 HTTPS 与真实天气接口',
    status: located.status,
    timezone: weather.timezone,
    source: weather.source,
  };
  report.checks.push(
    '证书正常校验通过',
    '移动视口为安全上下文',
    '定位 API 可用',
    '无示例模式提示',
    '真实全球搜索',
    '授权后定位进入坐标天气页',
  );
  const certificate = await fetch(runtime.setupURL + '/weather-atlas-root-ca.cer').then((r) =>
    r.arrayBuffer(),
  );
  assert.equal(
    new X509Certificate(Buffer.from(certificate)).fingerprint256,
    textAt(runtime, 'caFingerprint'),
  );
  report.checks.push('手机下载根证书指纹一致');
  await page.screenshot({ path: new URL('./evidence/local-https.png', import.meta.url).pathname });
  await context.close();
} finally {
  await browser.close();
  await writeFile(
    new URL('./evidence/local-https.json', import.meta.url),
    JSON.stringify(report, null, 2),
  );
}
console.log(JSON.stringify(report));
