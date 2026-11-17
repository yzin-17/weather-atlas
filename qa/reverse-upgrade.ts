import { parseJson, numberAt, recordsAt, objectAt, textAt } from './lib/json.ts';
import { decode as checked } from '../web/lib/validation.ts';
import { validPlace } from '../web/lib/contracts.ts';
import { validSnapshot } from '../web/lib/client-forecast.ts';
import { readForecast } from './lib/json.ts';
import { requireValue } from '../web/lib/validation.ts';
import type { Place, Forecast } from '../web/lib/types.ts';
type LegacyPreferences = Record<string, unknown> & {
  place: Place;
  saved: Place[];
  mode: string;
  origin: string;
};
import { execFileSync } from 'node:child_process';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const adb = process.env.ADB_PATH,
  oldApk = process.env.OLD_APK;
assert(adb && oldApk);
const pkg = 'dev.weatheratlas.weather_atlas',
  root = new URL('..', import.meta.url).pathname;
const run = (...args: string[]) =>
  execFileSync(adb, ['-s', 'emulator-5554', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
assert.equal(run('shell', 'getprop', 'ro.kernel.qemu'), '1', '仅允许受控模拟器');
let installed = '';
try {
  installed = run('shell', 'pm', 'path', pkg);
} catch {}
assert(!installed.includes('package:'), '已有应用时拒绝覆盖其偏好；此脚本仅用于空白测试模拟器');
for (let i = 0; i < 10; i++) {
  const f = await fetch('http://127.0.0.1:3300/api/weather?lat=25.0478&lon=121.5319').then((r) =>
    readForecast(r),
  );
  if (!f.stale) break;
  await setTimeout(500);
}
run('install', oldApk);
const point = {
  id: 'point',
  name: '地图选点',
  region: '',
  country: '',
  lat: 25.0478,
  lon: 121.5319,
};
const values = {
  place: point,
  saved: [point],
  mode: 'manual',
  locale: 'zh-Hans',
  origin: 'http://10.0.2.2:3300',
};
const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const xml =
  '<?xml version="1.0" encoding="utf-8"?>\n<map>\n' +
  Object.entries(values)
    .map(
      ([k, v]) =>
        `<string name="flutter.${k}">${escape(typeof v === 'string' ? v : JSON.stringify(v))}</string>`,
    )
    .join('\n') +
  '\n</map>';
const temp = await mkdtemp(path.join(os.tmpdir(), 'atlas-legacy-'));
await writeFile(path.join(temp, 'legacy.xml'), xml);
run('push', path.join(temp, 'legacy.xml'), '/data/local/tmp/weather-atlas-legacy.xml');
run('shell', 'run-as', pkg, 'mkdir', '-p', 'shared_prefs');
run(
  'shell',
  'run-as',
  pkg,
  'cp',
  '/data/local/tmp/weather-atlas-legacy.xml',
  'shared_prefs/FlutterSharedPreferences.xml',
);
const decode = (s: string) =>
  s.replace(
    /&(amp|quot|apos|lt|gt);/g,
    (_, k: 'amp' | 'quot' | 'apos' | 'lt' | 'gt') =>
      ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' })[k],
  );
function prefs() {
  const text = run('shell', 'run-as', pkg, 'cat', 'shared_prefs/FlutterSharedPreferences.xml'),
    out: Record<string, unknown> = {};
  for (const m of text.matchAll(/<string name="flutter\.([^"]+)">([\s\S]*?)<\/string>/g)) {
    let v: unknown = decode(m[2]);
    try {
      v = parseJson(decode(m[2]));
    } catch {}
    out[decode(m[1])] = v;
  }
  const place = checked(out.place, validPlace);
  const saved = recordsAt(out, 'saved').map((item) => checked(item, validPlace));
  return { ...out, place, saved, mode: textAt(out, 'mode'), origin: textAt(out, 'origin') };
}
function version() {
  return run('shell', 'dumpsys', 'package', pkg).match(/versionName=([^\s]+)/)?.[1];
}
const capture = (name: string) =>
  writeFile(
    new URL(`./evidence/${name}.png`, import.meta.url),
    execFileSync(adb, ['-s', 'emulator-5554', 'exec-out', 'screencap', '-p']),
  );
run('shell', 'am', 'start', '-n', pkg + '/.MainActivity');
for (let i = 0; i < 80; i++) {
  await setTimeout(200);
  if (
    Object.entries(prefs()).some(
      ([key, v]) =>
        key.startsWith('forecast.') &&
        (validSnapshot(v) ? v.timezone : undefined) === 'Asia/Taipei',
    )
  )
    break;
}
await setTimeout(250);
const before = { version: version(), values: prefs() };
assert.equal(before.version, '1.1.0');
assert.equal(before.values.place.id, 'point');
assert(!before.values.place.label);
await capture('reverse-upgrade-before');
run('install', '-r', path.join(root, 'mobile/build/app/outputs/flutter-apk/app-debug.apk'));
run('shell', 'am', 'start', '-n', pkg + '/.MainActivity');
let after: typeof before | undefined;
for (let i = 0; i < 80; i++) {
  await setTimeout(200);
  after = { version: version(), values: prefs() };
  if (after.values.place?.name === '台北' && after.values.place.label?.source === 'photon-osm')
    break;
}
assert.equal(requireValue(after).version, '1.1.1');
assert.equal(requireValue(after).values.place.name, '台北');
assert.equal(requireValue(after).values.place.id, 'point');
for (const field of ['lat', 'lon'] as const) {
  assert.equal(requireValue(after).values.place[field], before.values.place[field]);
  assert.equal(requireValue(after).values.saved[0][field], before.values.saved[0][field]);
}
assert.equal(requireValue(after).values.mode, 'manual');
assert.equal(requireValue(after).values.origin, before.values.origin);
const weather = checked(
  Object.entries(requireValue(after).values).find(
    ([key]) => key.startsWith('forecast.') && key.endsWith('25.0478,121.5319'),
  )?.[1],
  validSnapshot,
);
assert.equal(weather.timezone, 'Asia/Taipei');
await capture('reverse-upgrade-after');
// 只导出受控地点、收藏和版本，避免把其他偏好或设备数据带入证据。
const projection = (r: { version: string | undefined; values: LegacyPreferences } | undefined) => ({
  version: requireValue(r).version,
  place: requireValue(r).values.place,
  saved: requireValue(r).values.saved,
  mode: requireValue(r).values.mode,
  origin: requireValue(r).values.origin,
});
const report: {
  at: string;
  before: {
    version: string | undefined;
    place: unknown;
    saved: unknown;
    mode: unknown;
    origin: unknown;
  };
  after: {
    version: string | undefined;
    place: unknown;
    saved: unknown;
    mode: unknown;
    origin: unknown;
  };
  weather: { timezone: unknown; version: unknown };
  note: '空白 Android 模拟器，预置旧版不含 label 的地图点；实际 install -r 升级保留坐标并自动改名';
} = {
  at: new Date().toISOString(),
  before: projection(before),
  after: projection(after),
  weather: { timezone: weather.timezone, version: weather.version },
  note: '空白 Android 模拟器，预置旧版不含 label 的地图点；实际 install -r 升级保留坐标并自动改名',
};
await writeFile(
  new URL('./evidence/reverse-upgrade.json', import.meta.url),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
