import { parseJson, numberAt, recordsAt, jsonObject } from './lib/json.ts';
import { requireValue } from '../web/lib/validation.ts';
import { execFileSync } from 'node:child_process';
import { writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const adb = process.env.ADB_PATH;
if (!adb) throw Error('必须指定 ADB_PATH');
const phase = process.argv[2];
assert(['before', 'after'].includes(phase));
const xml = execFileSync(
  adb,
  [
    'shell',
    'run-as',
    'dev.weatheratlas.weather_atlas',
    'cat',
    'shared_prefs/FlutterSharedPreferences.xml',
  ],
  { encoding: 'utf8' },
);
const decode = (s: string) =>
  s.replace(
    /&(amp|quot|apos|lt|gt);/g,
    (_, k: 'amp' | 'quot' | 'apos' | 'lt' | 'gt') =>
      ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' })[k],
  );
const values: Record<string, unknown> = {};
for (const key of ['place', 'saved', 'mode', 'locale', 'origin'] as const) {
  const match = xml.match(new RegExp('<string name="flutter\\.' + key + '">([\\s\\S]*?)</string>'));
  if (match) {
    const text = decode(match[1]);
    try {
      values[key] = parseJson(text);
    } catch {
      values[key] = text;
    }
  }
}
assert.equal(values.mode, 'manual');
assert(Math.abs(numberAt(values, 'place', 'lon') - 121.5319) < 0.001);
assert(recordsAt(values, 'saved').some((p) => Math.abs(numberAt(p, 'lon') - 121.5319) < 0.001));
const pkg = execFileSync(adb, ['shell', 'dumpsys', 'package', 'dev.weatheratlas.weather_atlas'], {
  encoding: 'utf8',
});
const report: {
  at: string;
  phase: string;
  version: string | undefined;
  values: Record<string, unknown> & {
    mode?: string;
    place?: { lon: number };
    saved?: { lon: number }[];
  };
} = {
  at: new Date().toISOString(),
  phase,
  version: pkg.match(/versionName=([^\s]+)/)?.[1],
  values,
};
if (phase === 'after') {
  const before = jsonObject(
    await readFile(new URL('./evidence/android-upgrade-before.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(values, before.values);
  assert.equal(before.version, '1.0.0');
  assert.equal(report.version, '1.1.0');
}
await writeFile(
  new URL(`./evidence/android-upgrade-${phase}.json`, import.meta.url),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
