import { errorInfo } from '../web/lib/errors.ts';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const directory = process.env.VERIFICATION_WORK;
if (!directory) throw Error('必须提供 VERIFICATION_WORK');
const out = new URL('./evidence/logs/', import.meta.url);
await mkdir(out, { recursive: true });
const files = [
  'node-tests-final.log',
  'web-build-final.log',
  'flutter-analyze.log',
  'flutter-tests-final.log',
  'flutter-doctor-final.log',
  'android-licenses.log',
  'smoke-final.log',
  'ios-release-final.log',
  'ios-main-final.log',
  'build-tools-35-download.log',
  'platform-35-base-download.log',
  'android-baseline-build.log',
  'android-baseline-isolated-build.log',
  'android-final-build.log',
  'android-baseline-isolated-build.log.exit.json',
  'android-final-build.log.exit.json',
  'android-rules-integration.log',
  'android-model-integration.log',
  'android-location-granted.log',
  'android-location-granted-retest.log',
  'android-location-denied.log',
  'android-location-timeout.log',
  'android-permission-granted.log',
  'android-permission-denied.log',
  'android-permission-timeout.log',
  'ios-rules-integration-final.log',
  'ios-permission-ui.log',
  'ios-permission-denied-ui.log',
  'ios-permission-denied-ui-final.log',
  'ios-permission-granted-ui-final.log',
  'native-artifacts-final.log',
];
const secrets = ['OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'AI_API_KEY']
  .map((k) => process.env[k])
  .filter((value): value is string => !!value);
files.push(
  'ios-language-permissions.log',
  'ios-permission-en.log',
  'ios-permission-zh-Hant.log',
  'ios-permission-ko.log',
);
files.push(
  'android-live-model-integration.log',
  'ios-live-model-integration.log',
  'live-model-browser.log',
  'live-weather-final.log',
  'smoke-live-final.log',
  'seo-live-real.log',
  'seo-live-real-retest.log',
  'android-final-build-before-repack.log',
);
files.push('ios-share-final.log');
files.push('android-resilience.log', 'ios-resilience.log');
files.push('single-ask-build.log', 'single-ask-build-final.log', 'single-ask-draft.log');
files.push(
  'weather-map-node.log',
  'weather-map-build.log',
  'weather-map-production-build.log',
  'weather-map-flutter-analyze.log',
  'weather-map-flutter-tests.log',
  'weather-map-browser.log',
  'weather-map-browser-final.log',
  'weather-map-integrated.log',
  'weather-map-integrated-final.log',
  'weather-map-native.log',
  'weather-map-native-final.log',
  'weather-map-native-proxy-final.log',
  'weather-map-native-proxy-accepted.log',
  'weather-map-native-visual-final.log',
  'weather-map-native-visual-accepted.log',
  'weather-map-android-integration.log',
  'weather-map-ios-integration.log',
  'weather-map-mobile-builds.log',
  'weather-map-mobile-builds-final.log',
  'weather-map-android-debug-build.log',
  'weather-map-ios-simulator-debug-build.log',
  'weather-map-ios-simulator-universal-failed.log',
  'weather-map-ios-device-unsigned-build.log',
  'weather-map-size-before.log',
  'weather-map-size-after.log',
  'weather-map-resource-budget.log',
  'weather-map-production-browser.log',
  'weather-map-production-seo.log',
  'weather-map-production-https-seo.log',
  'weather-map-ask-regression.log',
  'weather-map-artifacts.log',
);
files.push(
  'place-loading-build.log',
  'place-loading-node.log',
  'place-loading-browser.log',
  'place-loading-browser-final.log',
  'place-loading-reverse-final.log',
  'place-loading-production-build.log',
  'place-loading-production-browser.log',
  'place-loading-production-before-count-fix.log',
  'place-loading-seo.log',
  'place-loading-https-seo.log',
);
files.push(
  'next-perf-before-build.log',
  'next-perf-after-build.log',
  'next-performance-node-tests.log',
  'next-performance-benchmark.log',
  'next-performance-benchmark-final.log',
  'next-performance-benchmark-isolated.log',
  'next-performance-browser-check.log',
  'next-performance-browser-lifecycle.log',
  'next-performance-seo-controlled.log',
  'next-performance-production-build.log',
  'next-performance-production-seo.log',
  'next-performance-production-https-seo.log',
  'next-performance-production-location.log',
  'next-performance-production-https-location.log',
);
files.push(
  'home-location-node.log',
  'home-location-build.log',
  'home-location-build-final.log',
  'home-location-qa.log',
  'home-location-final.log',
  'home-location-https.log',
  'home-location-layout.log',
  'home-location-seo.log',
  'home-location-harness-before-storage-guard.log',
);
files.push(
  'home-index-node.log',
  'home-index-build.log',
  'home-index-build-final.log',
  'home-index-live.log',
  'home-index-demo.log',
  'home-index-browser.log',
  'home-index-browser-final.log',
  'home-index-production.log',
  'home-index-https.log',
  'home-index-smoke.log',
);
files.push(
  'reverse-web-build-final.log',
  'reverse-node-all.log',
  'reverse-flutter-all.log',
  'reverse-flutter-analyze.log',
  'reverse-browser-final.log',
  'reverse-android-integration.log',
  'reverse-ios-integration.log',
  'reverse-android-app-regression.log',
  'reverse-ios-app-regression.log',
  'reverse-android-before-harness-fix.log',
  'reverse-android-build.log',
  'reverse-ios-release-build.log',
  'reverse-ios-main-build.log',
  'reverse-ios-normal-share-final.log',
  'reverse-upgrade.log',
  'reverse-smoke.log',
  'reverse-seo.log',
);
files.push(
  'seo-node-all.log',
  'seo-web-build.log',
  'seo-web-build-final.log',
  'seo-metadata-final.log',
  'seo-metadata-https-final.log',
  'seo-browser-final.log',
  'seo-smoke-final.log',
);
files.push(
  'seo-audit-node.log',
  'seo-audit-build.log',
  'seo-audit-build-final.log',
  'seo-audit-before.log',
  'seo-audit-qa.log',
  'seo-audit-final.log',
  'seo-audit-https.log',
  'seo-audit-demo.log',
  'seo-config-check.log',
  'seo-failure-after.log',
  'seo-failure-final.log',
  'seo-audit-browser-final.log',
  'seo-audit-home-browser.log',
  'seo-audit-smoke.log',
  'seo-audit-main-server.log',
  'seo-audit-https-server.log',
);
for (const name of files) {
  let text: string;
  try {
    text = await readFile(path.join(directory, name), 'utf8');
  } catch (e) {
    if (errorInfo(e).code === 'ENOENT') continue;
    throw e;
  }
  for (const secret of secrets)
    if (text.includes(secret)) throw Error('日志含凭据，拒绝导出：' + name);
  // 不保留本机调试服务的临时访问令牌；保留构建／测试结果。
  text = text
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => !l.includes('Dart VM Service') && !l.includes('Flutter DevTools debugger'))
    .join('\n');
  await writeFile(new URL(name, out), text);
}
console.log('验收日志投影已保存至 qa/evidence/logs/');
