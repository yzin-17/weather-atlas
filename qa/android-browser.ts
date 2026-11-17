import { chromium } from 'playwright-core';
import { requireValue } from '../web/lib/validation.ts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { type Locator } from 'playwright-core';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0],
  page = context.pages()[0] || (await context.newPage());
const cdp = await context.newCDPSession(page);
async function tap(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  assert(b);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const report: {
  at: string;
  browser: string;
  device: 'Android 17 API 37 arm64 emulator, actual Chrome';
  checks: (
    | '实际手机 Chrome 首屏与横向溢出'
    | '触控三轮比较与台北依据'
    | '实际软键盘焦点及输入'
    | '软键盘显示时提交按钮可见且可触控提交'
  )[];
  viewport?: { width: number; height: number; overflow: boolean; secure: boolean };
  keyboard?: {
    before: number;
    after: number;
    input: { x: number; y: number; width: number; height: number } | null;
    submit: { x: number; y: number; width: number; height: number } | null;
    submitVisible: true;
  };
} = {
  at: new Date().toISOString(),
  browser: browser.version(),
  device: 'Android 17 API 37 arm64 emulator, actual Chrome',
  checks: [],
};
try {
  await page.goto('http://10.0.2.2:3300/zh-Hans/weather/seoul-1835848', {
    waitUntil: 'networkidle',
  });
  report.viewport = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    overflow: document.documentElement.scrollWidth > innerWidth,
    secure: isSecureContext,
  }));
  assert.equal(report.viewport.overflow, false);
  report.checks.push('实际手机 Chrome 首屏与横向溢出');
  await tap(page.locator('.ask-launcher'));
  await tap(page.locator('.prompts button').last());
  await page.locator('.answer').first().waitFor();
  for (const label of ['那下午呢？', '哪个更冷？'] as const) {
    await tap(page.getByRole('button', { name: label, exact: true }));
    await page.locator('.answer').first().waitFor();
  }
  await tap(page.locator('.evidence button').filter({ hasText: '台北' }).first());
  assert((await page.getByTestId('comparison-forecast').innerText()).includes('Asia/Taipei'));
  report.checks.push('触控三轮比较与台北依据');
  await page.screenshot({
    path: new URL('./evidence/android-chrome-evidence.png', import.meta.url).pathname,
  });
  await tap(page.getByRole('button', { name: '返回', exact: true }));
  const input = page.locator('textarea');
  const before = await page.evaluate(() =>
    (() => {
      if (!visualViewport) throw Error('Missing visual viewport');
      return visualViewport.height;
    })(),
  );
  await tap(input);
  await page.waitForFunction(
    (height: number) =>
      (() => {
        if (!visualViewport) throw Error('Missing visual viewport');
        return visualViewport.height;
      })() <
      height - 100,
    before,
    {
      timeout: 10000,
    },
  );
  await input.fill('那下午呢？');
  const submit = page.getByRole('button', { name: '提问', exact: true });
  await submit.scrollIntoViewIfNeeded();
  const visible = await page.evaluate(() =>
      (() => {
        if (!visualViewport) throw Error('Missing visual viewport');
        return visualViewport.height;
      })(),
    ),
    box = await submit.boundingBox();
  assert(requireValue(box).y + requireValue(box).height <= visible);
  report.keyboard = {
    before,
    after: visible,
    input: await input.boundingBox(),
    submit: box,
    submitVisible: true,
  };
  report.checks.push('实际软键盘焦点及输入');
  await page.screenshot({
    path: new URL('./evidence/android-chrome-keyboard.png', import.meta.url).pathname,
  });
  if (process.env.ADB_PATH)
    await writeFile(
      new URL('./evidence/android-chrome-keyboard-native.png', import.meta.url),
      execFileSync(process.env.ADB_PATH, ['exec-out', 'screencap', '-p']),
    );
  await tap(submit);
  await page.locator('.answer').first().waitFor();
  report.checks.push('软键盘显示时提交按钮可见且可触控提交');
} finally {
  await writeFile(
    new URL('./evidence/android-browser.json', import.meta.url),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
console.log(JSON.stringify(report));
