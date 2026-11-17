import { jsonObject, recordsAt, textAt } from './lib/json.ts';
import { parseJson } from '../web/lib/validation.ts';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const device = process.env.IOS_DEVICE;
if (!device) throw Error('必须提供 IOS_DEVICE，并先通过 XCTest 点击普通应用的复制城市链接按钮');
const pkg = 'dev.weatheratlas.weatherAtlas';
const sim = (...args: string[]) =>
  execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8' }).trim();
const data = sim('get_app_container', device, pkg, 'data');
const prefs = jsonObject(
  execFileSync(
    'plutil',
    ['-convert', 'json', '-o', '-', `${data}/Library/Preferences/${pkg}.plist`],
    { encoding: 'utf8' },
  ),
);
const place = jsonObject(textAt(prefs, 'flutter.place'));
const saved = recordsAt(parseJson(textAt(prefs, 'flutter.saved')));
assert.equal(place.name, '台北');
assert.equal(place.id, 'point');
assert.equal(place.lat, 25.0478);
assert.equal(place.lon, 121.5319);
assert.equal(saved.find((p) => p.id === 'point')?.name, '台北');
const copied = sim('pbpaste', device);
const url = new URL(copied);
assert.equal(url.searchParams.get('lat'), '25.0478');
assert.equal(url.searchParams.get('lon'), '121.5319');
assert.equal(url.searchParams.has('labelLocale'), false);
const installed = sim('get_app_container', device, pkg, 'app');
const built = new URL('../mobile/build/ios/Debug-iphonesimulator/Runner.app/', import.meta.url);
const kernelPath = 'Frameworks/App.framework/flutter_assets/kernel_blob.bin';
const kernel = await readFile(`${installed}/${kernelPath}`);
assert.deepEqual(kernel, await readFile(new URL(kernelPath, built)));
assert.ok(kernel.includes(Buffer.from('/api/reverse')));
for (const test of [
  'app_flow_test.dart',
  'reverse_flow_test.dart',
  'resilience_test.dart',
] as const)
  assert.ok(!kernel.includes(Buffer.from(test)));
const browser = await chromium.launch({ headless: true });
let heading: string;
try {
  const page = await browser.newPage();
  await page.goto(copied);
  await page.getByRole('heading', { name: '台北', exact: true }).waitFor({ timeout: 20000 });
  heading = await page.locator('h1').innerText();
} finally {
  await browser.close();
}
sim(
  'io',
  device,
  'screenshot',
  new URL('./evidence/reverse-ios-normal.png', import.meta.url).pathname,
);
const record = {
  at: new Date().toISOString(),
  device,
  place,
  saved,
  copied,
  browserHeading: heading,
  normalEntry: true,
  installedMatchesBuilt: true,
  kernelSHA256: createHash('sha256').update(kernel).digest('hex'),
};
await writeFile(
  new URL('./evidence/reverse-ios-normal.json', import.meta.url),
  JSON.stringify(record, null, 2),
);
console.log('iOS 普通包旧地图点恢复、收藏、实际剪贴板及 Web 深链通过');
