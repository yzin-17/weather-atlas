import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
// 在 Flutter 测试安装应用后、启动测试前配置真实系统权限；不替换定位插件。
const adb = process.env.ADB_PATH,
  mode = process.argv[2],
  pkg = 'dev.weatheratlas.weather_atlas';
assert(adb && ['granted', 'denied', 'timeout'].includes(mode));
const run = (...args: string[]) =>
  execFileSync(adb, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let installed = false;
for (let i = 0; i < 600; i++) {
  try {
    if (run('shell', 'pm', 'path', pkg).includes('package:')) {
      installed = true;
      break;
    }
  } catch {}
  await setTimeout(200);
}
assert(installed, '等待测试应用安装超时');
const permission = 'android.permission.ACCESS_COARSE_LOCATION';
run('shell', 'pm', 'clear-permission-flags', pkg, permission, 'user-set', 'user-fixed');
if (mode !== 'denied') run('shell', 'pm', 'grant', pkg, permission);
else {
  run('shell', 'pm', 'revoke', pkg, permission);
  run('shell', 'pm', 'set-permission-flags', pkg, permission, 'user-set', 'user-fixed');
}
run('shell', 'cmd', 'location', 'set-location-enabled', 'true');
run('emu', 'geo', 'fix', '121.5319', '25.0478');
// 低精度授权采用网络定位；此无网络定位服务的模拟器需提供系统测试 provider。
if (mode === 'granted') {
  run('shell', 'appops', 'set', 'com.android.shell', 'android:mock_location', 'allow');
  run('shell', 'cmd', 'location', 'providers', 'add-test-provider', 'network', '--requiresNetwork');
  run('shell', 'cmd', 'location', 'providers', 'set-test-provider-enabled', 'network', 'true');
}
const state = run('shell', 'dumpsys', 'package', pkg)
  .split('\n')
  .filter((l) => l.includes(permission) && l.includes('granted='));
assert(state.some((l) => l.includes('granted=' + String(mode !== 'denied'))));
await writeFile(
  new URL(`./evidence/android-permission-${mode}.json`, import.meta.url),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      mode,
      permission,
      state,
      mockCoordinate: { lat: 25.0478, lon: 121.5319 },
      note: '模拟器系统模拟位置；不是真机 GPS',
    },
    null,
    2,
  ),
);
console.log(mode, state);
if (mode === 'granted')
  try {
    for (let i = 0; i < 45; i++) {
      run(
        'shell',
        'cmd',
        'location',
        'providers',
        'set-test-provider-location',
        'network',
        '--location',
        '25.0478,121.5319',
        '--accuracy',
        '100',
      );
      run('emu', 'geo', 'fix', '121.5319', '25.0478');
      await setTimeout(1000);
    }
  } finally {
    run('shell', 'cmd', 'location', 'providers', 'remove-test-provider', 'network');
    run('shell', 'appops', 'set', 'com.android.shell', 'android:mock_location', 'default');
  }
