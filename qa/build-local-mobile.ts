import { recordsAt, parseJson, textAt } from './lib/json.ts';
import { spawn } from 'node:child_process';
import { open, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = new URL('..', import.meta.url).pathname;
const sdk = process.env.FLUTTER_SDK,
  work = process.env.VERIFICATION_WORK;
if (!sdk || !work) throw Error('请提供 FLUTTER_SDK 与 VERIFICATION_WORK');
const env = { ...process.env };
for (const key of [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'AI_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
])
  delete env[key];
Object.assign(env, {
  JAVA_HOME: '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
  JAVA_TOOL_OPTIONS:
    '-Dhttp.proxyHost= -Dhttps.proxyHost= -DsocksProxyHost= -Djava.net.useSystemProxies=false',
  GRADLE_USER_HOME: path.join(work, 'gradle-weather-atlas'),
});
const selected = process.env.MOBILE_BUILD_TARGETS?.split(',');
const prefix = process.env.QA_MAP_RUN || 'weather-map';
if (!/^[a-z0-9-]+$/.test(prefix)) throw Error('构建记录前缀无效');
const reportFile = path.join(root, `qa/evidence/${prefix}-mobile-builds.json`);
const report = selected
  ? recordsAt(parseJson(await readFile(reportFile, 'utf8'))).filter(
      (r) => !selected.includes(textAt(r, 'name')),
    )
  : [];
const targets: [string, string[]][] = [
  [
    'android-debug',
    [
      'build',
      'apk',
      '--debug',
      '--no-pub',
      '--target',
      'lib/main.dart',
      '--dart-define=WEATHER_API_BASE=http://10.0.2.2:3300',
    ],
  ],
  [
    'ios-simulator-debug',
    [
      'run',
      '-d',
      process.env.QA_IOS_DEVICE || '23AB3E1A-4C30-462C-943C-B9CB5B894E96',
      '--debug',
      '--no-resident',
      '--no-pub',
      '--target',
      'lib/main.dart',
      '--dart-define=WEATHER_API_BASE=http://127.0.0.1:3300',
    ],
  ],
  [
    'ios-device-unsigned',
    [
      'build',
      'ios',
      '--release',
      '--no-codesign',
      '--no-pub',
      '--target',
      'lib/main.dart',
      '--dart-define=WEATHER_API_BASE=http://yzinMac-Mini-m6.local:3300',
    ],
  ],
];
for (const [name, args] of targets) {
  if (selected && !selected.includes(String(name))) continue;
  args.push('--dart-define=WEATHER_SITE_URL=http://yzinMac-Mini-m6.local:3300');
  const started = new Date().toISOString(),
    logfile = path.join(work, `${prefix}-${name}-build.log`);
  const fd = await open(logfile, 'w');
  console.log('开始构建：' + name);
  const child = spawn(path.join(sdk, 'bin/flutter'), args, {
    cwd: path.join(root, 'mobile'),
    env,
    stdio: ['ignore', fd.fd, fd.fd],
  });
  await fd.close();
  const code = await new Promise<number | null>((resolve) => child.once('exit', resolve));
  report.push({ name, args, started, ended: new Date().toISOString(), code, logfile });
  await writeFile(reportFile, JSON.stringify(report, null, 2));
  assert.equal(code, 0, `${name} 失败，查看 ${logfile}`);
  console.log('构建通过：' + name);
}
