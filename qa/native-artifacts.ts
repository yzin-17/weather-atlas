import { jsonObject, textAt } from './lib/json.ts';
import { requireValue } from '../web/lib/validation.ts';
import { spawnSync, execFileSync } from 'node:child_process';
import { writeFile, stat, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('..', import.meta.url));
const version = textAt(
  jsonObject(await readFile(path.join(root, 'web/package.json'), 'utf8')),
  'version',
);
const mobile = (await readFile(path.join(root, 'mobile/pubspec.yaml'), 'utf8')).match(
  /^version:\s*([^+\s]+)\+(\d+)/m,
);
assert(mobile && mobile[1] === version);
const build = mobile[2];
const report: {
  at: string;
  ios: {
    mode: 'arm64 模拟器 Debug' | 'arm64 设备 Release 未签名';
    path: string;
    bundle: unknown;
    version: unknown;
    build: unknown;
    minimumOS: unknown;
    platforms: unknown;
    architectures: string;
    signature: string;
    permissions: {};
  }[];
  android: null | {
    path: string;
    bytes: number;
    badging: string[];
    signature: string;
    device?: Record<string, string>;
  };
} = { at: new Date().toISOString(), ios: [], android: null };
for (const [directory, mode] of [
  ['Debug-iphonesimulator', 'arm64 模拟器 Debug'],
  ['iphoneos', 'arm64 设备 Release 未签名'],
] as const) {
  const app = path.join(root, 'mobile/build/ios', directory, 'Runner.app');
  const info = jsonObject(
    execFileSync('plutil', ['-convert', 'json', '-o', '-', path.join(app, 'Info.plist')], {
      encoding: 'utf8',
    }),
  );
  assert.equal(info.CFBundleShortVersionString, version);
  assert.equal(info.CFBundleVersion, build);
  assert.equal(info.MinimumOSVersion, '15.0');
  const signature = spawnSync('codesign', ['-dv', '--verbose=2', app], { encoding: 'utf8' });
  const permissions: Record<string, string> = {};
  for (const locale of ['en', 'zh-Hans', 'zh-Hant', 'ko'] as const) {
    const file = path.join(app, `${locale}.lproj/InfoPlist.strings`);
    const strings = jsonObject(
      execFileSync('plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' }),
    );
    if (!strings.NSLocationWhenInUseUsageDescription) throw Error('缺少定位本地化：' + locale);
    permissions[locale] = textAt(strings, 'NSLocationWhenInUseUsageDescription');
  }
  report.ios.push({
    mode,
    path: app,
    bundle: info.CFBundleIdentifier,
    version: info.CFBundleShortVersionString,
    build: info.CFBundleVersion,
    minimumOS: info.MinimumOSVersion,
    platforms: info.CFBundleSupportedPlatforms,
    architectures: execFileSync('lipo', ['-archs', path.join(app, 'Runner')], {
      encoding: 'utf8',
    }).trim(),
    signature:
      signature.status === 0
        ? signature.stderr.includes('Signature=adhoc')
          ? 'ad-hoc'
          : '已签名，需检查身份'
        : '未签名',
    permissions,
  });
}
const sdk = process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), 'Library/Android/sdk'),
  tools = path.join(sdk, 'build-tools/35.0.0');
const apk = path.join(root, 'mobile/build/app/outputs/flutter-apk/app-debug.apk');
const badging = execFileSync(path.join(tools, 'aapt'), ['dump', 'badging', apk], {
  encoding: 'utf8',
});
assert(badging.includes(`versionName='${version}'`));
assert(badging.includes(`versionCode='${build}'`));
const signed = execFileSync(path.join(tools, 'apksigner'), ['verify', '--print-certs', apk], {
  encoding: 'utf8',
});
report.android = {
  path: apk,
  bytes: (await stat(apk)).size,
  badging: badging
    .split('\n')
    .filter((l) => /^(package:|sdkVersion:|targetSdkVersion:|native-code:)/.test(l)),
  signature: signed.trim(),
};
if (process.env.ADB_PATH) {
  const adb = process.env.ADB_PATH;
  requireValue(report.android).device = Object.fromEntries(
    ['ro.product.model', 'ro.build.version.release', 'ro.build.version.sdk'].map((k) => [
      k,
      execFileSync(adb, ['shell', 'getprop', k], { encoding: 'utf8' }).trim(),
    ]),
  );
}
await writeFile(
  new URL(`./evidence/native-artifacts-v${version}.json`, import.meta.url),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
