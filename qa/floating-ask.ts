import { chromium } from 'playwright-core';
import { requireValue } from '../web/lib/validation.ts';
import { errorInfo } from '../web/lib/errors.ts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { labels } from '../web/lib/ui-text.ts';

const origin = process.env.APP_URL || 'http://localhost:3304',
  t = labels('zh-Hans');
const browser = await chromium.launch({ headless: true }),
  report: {
    at: string;
    origin: string;
    layouts: {
      width: 1440 | 1024 | 768 | 390 | 820 | 320;
      height: 1024 | 768 | 844 | 900 | 1180 | 740;
      panel: { x: number; y: number; width: number; height: number } | null;
      backgroundInteractive: true;
      draftRetained: true;
    }[];
    checks: (
      | '等待回答时收起，恢复后保留回答与两城上下文'
      | '三轮追问保留下午；台北依据在浮窗内置顶显示'
      | '缩小可视高度后输入与发送可见；Shift+Enter 换行、输入法确认不误发'
      | '四语面板、收起按钮和入口名称正确'
    )[];
    errors: string[];
    askStatuses?: number[];
  } = { at: new Date().toISOString(), origin, layouts: [], checks: [], errors: [] };
try {
  // 演示天气先进入新鲜状态，避免将后台更新产生的版本冲突混进布局检查。
  for (const coords of ['37.566,126.9784', '25.0478,121.5319'] as const) {
    const [lat, lon] = coords.split(',');
    await fetch(`${origin}/api/weather?lat=${lat}&lon=${lon}`);
  }
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [820, 1180],
    [768, 1024],
    [390, 844],
    [320, 740],
  ] as const) {
    const context = await browser.newContext({ viewport: { width, height } }),
      page = await context.newPage();
    page.on('pageerror', (e) => report.errors.push(errorInfo(e).message));
    await page.goto(origin + '/zh-Hans/weather/seoul-1835848', { waitUntil: 'domcontentloaded' });
    await page.locator('.ask-launcher').click();
    const panel = page.locator('.ask-panel');
    await panel.waitFor();
    await page.waitForTimeout(220);
    const box = await panel.boundingBox(),
      edge = width <= 730 ? 12 : 24;
    assert(Math.abs(requireValue(box).x + requireValue(box).width - (width - edge)) < 2);
    assert(Math.abs(requireValue(box).y + requireValue(box).height - (height - edge)) < 2);
    assert(requireValue(box).x >= 0 && requireValue(box).y >= 0);
    assert.equal(await panel.getAttribute('aria-modal'), 'false');
    assert.equal(await page.locator('dialog:modal').count(), 0);
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.locator('#weather-question').fill('保留这段输入');
    await page.getByRole('button', { name: t.find, exact: true }).click();
    const search = page.locator('dialog.dialog');
    await search.waitFor();
    await search.getByRole('button', { name: t.close, exact: true }).click();
    assert.equal(await page.locator('#weather-question').inputValue(), '保留这段输入');
    await panel.getByRole('button', { name: t.minimizeAsk, exact: true }).click();
    await page.locator('.ask-launcher').click();
    await panel.waitFor();
    assert.equal(await page.locator('#weather-question').inputValue(), '保留这段输入');
    await page.locator('#weather-question').fill('');
    await page.screenshot({
      path: new URL(`./evidence/ask-floating-${width}.png`, import.meta.url).pathname,
      animations: 'disabled',
    });
    report.layouts.push({
      width,
      height,
      panel: box,
      backgroundInteractive: true,
      draftRetained: true,
    });
    await page.locator('#weather-question').press('Escape');
    await page.locator('.ask-launcher').waitFor();
    await page.waitForFunction(() => document.activeElement?.classList.contains('ask-launcher'));
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(errorInfo(e).message));
  const statuses: number[] = [];
  page.on('response', (r) => {
    if (r.url().endsWith('/api/ask')) statuses.push(r.status());
  });
  await page.route('**/api/ask', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  await page.goto(origin + '/zh-Hans/weather/seoul-1835848', { waitUntil: 'domcontentloaded' });
  await page.locator('.ask-launcher').click();
  await page.locator('.prompts button').last().click();
  await page
    .locator('.ask-panel')
    .getByRole('button', { name: t.minimizeAsk, exact: true })
    .click();
  await page.waitForResponse((r: { url: () => string }) => r.url().endsWith('/api/ask'));
  await page.locator('.ask-launcher').click();
  async function answerReady() {
    const refresh = page.getByRole('button', { name: t.refreshForecasts, exact: true });
    await page.locator('.answer').first().or(refresh).waitFor();
    if (await refresh.isVisible()) await refresh.click();
    await page.locator('.answer').first().waitFor();
  }
  await answerReady();
  report.checks.push('等待回答时收起，恢复后保留回答与两城上下文');
  for (const name of [t.followAfternoon, t.followCold] as const) {
    await page.getByRole('button', { name, exact: true }).click();
    await answerReady();
  }
  assert((await page.locator('.answer').first().innerText()).includes('12:00–17:00'));
  await page.locator('.evidence button').filter({ hasText: '台北' }).first().click();
  const preview = page.getByTestId('comparison-forecast');
  await preview.waitFor();
  assert((await preview.innerText()).includes('Asia/Taipei'));
  const heading = await preview.locator('h3').boundingBox(),
    panel = await page.locator('.ask-panel').boundingBox();
  assert(
    requireValue(heading).y >= requireValue(panel).y &&
      requireValue(heading).y < requireValue(panel).y + requireValue(panel).height,
  );
  report.checks.push('三轮追问保留下午；台北依据在浮窗内置顶显示');
  await page.screenshot({
    path: new URL('./evidence/ask-floating-evidence.png', import.meta.url).pathname,
  });
  await preview.getByRole('button', { name: t.back, exact: true }).click();
  await page.setViewportSize({ width: 390, height: 440 });
  await page.waitForTimeout(150);
  const input = await page.locator('#weather-question').boundingBox(),
    send = await page.locator('.ask-submit').boundingBox();
  assert(requireValue(input).y >= 0 && requireValue(input).y + requireValue(input).height <= 440);
  assert(requireValue(send).y >= 0 && requireValue(send).y + requireValue(send).height <= 440);
  await page.locator('#weather-question').fill('第一行');
  await page.locator('#weather-question').press('Shift+Enter');
  assert((await page.locator('#weather-question').inputValue()).includes('\n'));
  const before = statuses.length;
  await page
    .locator('#weather-question')
    .evaluate((el) =>
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }),
      ),
    );
  await page.waitForTimeout(100);
  assert.equal(statuses.length, before);
  report.checks.push('缩小可视高度后输入与发送可见；Shift+Enter 换行、输入法确认不误发');
  await context.close();
  for (const locale of ['zh-Hant', 'en', 'ko'] as const) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } }),
      page = await context.newPage(),
      words = labels(locale);
    await page.goto(origin + `/${locale}/weather/seoul-1835848`, { waitUntil: 'domcontentloaded' });
    await page.locator('.ask-launcher').click();
    await page.getByRole('dialog', { name: words.ask, exact: true }).waitFor();
    await page.getByRole('button', { name: words.minimizeAsk, exact: true }).click();
    await page.locator('.ask-launcher').waitFor();
    await context.close();
  }
  report.checks.push('四语面板、收起按钮和入口名称正确');
  report.askStatuses = statuses;
  assert.deepEqual(report.errors, []);
} finally {
  await browser.close();
  await writeFile(
    new URL('./evidence/ask-floating.json', import.meta.url),
    JSON.stringify(report, null, 2),
  );
}
console.log(
  JSON.stringify({
    layouts: report.layouts.length,
    checks: report.checks,
    askStatuses: report.askStatuses,
    errors: report.errors,
  }),
);
