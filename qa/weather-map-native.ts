import { binaryChunks } from './lib/bytes.ts';
import { jsonObject, textAt, arrayAt } from './lib/json.ts';
import { readStats } from './lib/json.ts';
import { requireValue } from '../web/lib/validation.ts';
import { errorInfo } from '../web/lib/errors.ts';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { open, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = new URL('..', import.meta.url).pathname;
const sdk = process.env.FLUTTER_SDK;
if (!sdk) throw Error('请提供 FLUTTER_SDK');
const work = process.env.VERIFICATION_WORK;
if (!work) throw Error('请提供 VERIFICATION_WORK');
const deviceCandidates: [string, string | undefined][] = [
  ['android', process.env.QA_ANDROID_DEVICE],
  ['ios', process.env.QA_IOS_DEVICE],
];
const devices = deviceCandidates.filter(
  (pair): pair is [string, string] => typeof pair[1] === 'string' && pair[1].length > 0,
);
if (!devices.length) throw Error('请提供 QA_ANDROID_DEVICE 或 QA_IOS_DEVICE');
const prefix = process.env.QA_MAP_RUN || 'weather-map';
if (!/^[a-z0-9-]+$/.test(prefix)) throw Error('验收记录前缀无效');
const checkpoints: { device: string; phase: string }[] = [],
  deviceMap = Object.fromEntries(devices);
const local = await readFile(path.join(root, 'mobile/android/local.properties'), 'utf8');
const androidSdk = requireValue(
  local.split('\n').find((line) => line.startsWith('sdk.dir=')),
).slice(8);
const receiver = http.createServer(async (request, response) => {
  try {
    const body: Uint8Array[] = [];
    for await (const part of binaryChunks(request)) body.push(part);
    const raw = jsonObject(Buffer.concat(body).toString('utf8'));
    const data = { device: textAt(raw, 'device'), phase: textAt(raw, 'phase') };
    assert(['map-open', 'map-selected', 'completed'].includes(data.phase));
    assert(deviceMap[data.device]);
    if (data.phase !== 'completed') {
      const file = path.join(root, 'qa/evidence', `${prefix}-${data.device}-${data.phase}.png`);
      if (data.device === 'android')
        await writeFile(
          file,
          execFileSync(
            path.join(androidSdk, 'platform-tools/adb'),
            ['-s', requireValue(deviceMap.android), 'exec-out', 'screencap', '-p'],
            { maxBuffer: 16 * 1024 * 1024 },
          ),
        );
      else
        execFileSync(
          'xcrun',
          ['simctl', 'io', requireValue(deviceMap.ios), 'screenshot', '--type=png', file],
          {
            stdio: 'ignore',
          },
        );
    }
    checkpoints.push(data);
    console.log(`${data.device}: ${data.phase}`);
    response.end('ok');
  } catch (error) {
    console.error('原生截图记录失败：' + errorInfo(error).message);
    response.statusCode = 500;
    response.end(String(error));
  }
});
await new Promise<void>((resolve) => receiver.listen(3334, '0.0.0.0', resolve));
try {
  for (const [platform, device] of devices) {
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
    ] as const)
      delete env[key];
    Object.assign(env, {
      JAVA_HOME: '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
      JAVA_TOOL_OPTIONS:
        '-Dhttp.proxyHost= -Dhttps.proxyHost= -DsocksProxyHost= -Djava.net.useSystemProxies=false',
      GRADLE_USER_HOME: path.join(work, 'gradle-weather-atlas'),
    });
    const host = platform === 'android' ? '10.0.2.2' : '127.0.0.1';
    const args = [
      'test',
      'integration_test/weather_map_test.dart',
      '-d',
      device,
      '--no-pub',
      `--dart-define=WEATHER_API_BASE=http://${host}:3332`,
      `--dart-define=QA_RECEIVER=http://${host}:3334`,
      `--dart-define=QA_DEVICE=${platform}`,
    ];
    const logfile = path.join(work, `${prefix}-${platform}-integration.log`),
      fd = await open(logfile, 'w');
    console.log(`${platform}: 开始原生地图集成验收`);
    const before = await readStats(await fetch('http://127.0.0.1:3333/stats'));
    const child = spawn(path.join(sdk, 'bin/flutter'), args, {
      cwd: path.join(root, 'mobile'),
      env,
      stdio: ['ignore', fd.fd, fd.fd],
    });
    await fd.close();
    const code = await new Promise<number | null>((resolve) => child.once('exit', resolve));
    const after = await readStats(await fetch('http://127.0.0.1:3333/stats'));
    const log = await readFile(logfile, 'utf8');
    const found = log.match(/WEATHER_MAP_NATIVE_RESULT:(\{[^\n]+\})/);
    const result = found ? jsonObject(found[1]) : null;
    await writeFile(
      path.join(root, 'qa/evidence', `${prefix}-native-${platform}.json`),
      JSON.stringify(
        {
          date: new Date().toISOString(),
          platform,
          device,
          args,
          code,
          result,
          checkpoints: checkpoints.filter((c) => c.device === platform),
          upstreamBefore: before,
          upstreamAfter: after,
          logfile,
          realModelCalls: 0,
        },
        null,
        2,
      ),
    );
    assert.equal(code, 0, `原生验收失败，查看 ${logfile}`);
    assert(result);
    console.log(`${platform}: 通过，真实瓦片 ${arrayAt(result, 'tiles').length} 次`);
  }
} finally {
  await new Promise((resolve) => receiver.close(resolve));
}
