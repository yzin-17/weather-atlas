import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = new URL('..', import.meta.url).pathname,
  work = process.env.VERIFICATION_WORK;
if (!work) throw Error('请提供 VERIFICATION_WORK');
const apk = path.join(root, 'mobile/build/app/outputs/flutter-apk/app-debug.apk');
const tools = '/Users/yzin/Library/Android/sdk/build-tools/35.0.0';
const exec = (command: string, args: readonly string[]) =>
  execFileSync(command, args, { encoding: 'utf8' }).trim();
const badging = exec(path.join(tools, 'aapt'), ['dump', 'badging', apk]).split('\n')[0];
assert(badging.includes("versionCode='4'"));
assert(badging.includes("versionName='1.1.2'"));
const cert = (file: string) =>
  exec(path.join(tools, 'apksigner'), ['verify', '--print-certs', file])
    .split('\n')
    .find((line) => line.includes('certificate SHA-256 digest:'));
const old = path.join(work, '../outputs/v1.1.1/Weather-Atlas-Android-Debug-v1.1.1.apk');
const signature = cert(apk);
assert.equal(signature, cert(old));
const hash = (buffer: string | NodeJS.ArrayBufferView<ArrayBufferLike> | NonSharedBuffer) =>
  createHash('sha256').update(buffer).digest('hex');
assert.equal(
  hash(await readFile(apk)),
  hash(await readFile(path.join(work, 'weather-map-normal-artifacts/app-debug.apk'))),
);
const sim = path.join(root, 'mobile/build/ios/Debug-iphonesimulator/Runner.app');
const kernel = 'Frameworks/App.framework/flutter_assets/kernel_blob.bin';
assert.equal(
  hash(await readFile(path.join(sim, kernel))),
  hash(await readFile(path.join(work, 'weather-map-normal-artifacts/Runner.app', kernel))),
);
const simSign = spawnSync('codesign', ['-dv', sim], { encoding: 'utf8' });
assert.equal(simSign.status, 0);
assert(simSign.stderr.includes('Signature=adhoc'));
const device = path.join(root, 'mobile/build/ios/iphoneos/Runner.app');
const deviceSign = spawnSync('codesign', ['-dv', device], { encoding: 'utf8' });
assert.notEqual(deviceSign.status, 0);
const report: {
  date: string;
  android: {
    package: string;
    certificate: string | undefined;
    previousSignatureMatches: true;
    ordinaryArtifactRestored: true;
    runningPid: string;
  };
  iosSimulator: { architecture: string; signing: string; ordinaryKernelRestored: true };
  iosDevice: { architecture: string; signing: string };
} = {
  date: new Date().toISOString(),
  android: {
    package: badging,
    certificate: signature,
    previousSignatureMatches: true,
    ordinaryArtifactRestored: true,
    runningPid: exec('/Users/yzin/Library/Android/sdk/platform-tools/adb', [
      '-s',
      'emulator-5554',
      'shell',
      'pidof',
      'dev.weatheratlas.weather_atlas',
    ]),
  },
  iosSimulator: {
    architecture: exec('lipo', ['-archs', path.join(sim, 'Runner')]),
    signing: 'adhoc',
    ordinaryKernelRestored: true,
  },
  iosDevice: {
    architecture: exec('lipo', ['-archs', path.join(device, 'Runner')]),
    signing: 'unsigned',
  },
};
await writeFile(
  new URL('./evidence/weather-map-artifacts.json', import.meta.url),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
