import { jsonObject, objectAt, recordsAt } from './lib/json.ts';
import { parseJson, isArray } from '../web/lib/validation.ts';
import { errorInfo } from '../web/lib/errors.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execute } from './lib/command.ts';

const bundle = 'dev.weatheratlas.weatherAtlas';
const languages = [
  ['en', 'en_US'],
  ['zh-Hant', 'zh_TW'],
  ['ko', 'ko_KR'],
];

export async function runLanguagePermissions({
  device,
  work,
  app,
  evidence = fileURLToPath(new URL('./evidence/', import.meta.url)),
  run = execute,
  signal,
  progress = console.log,
}: {
  device?: string;
  work?: string;
  app?: string;
  evidence?: string;
  run?: (
    command: string,
    args: readonly (string | number)[],
    options?: Parameters<typeof execute>[2],
  ) => Promise<{ stdout: string; stderr?: string }>;
  signal?: AbortSignal;
  progress?: (message: string) => void;
}) {
  if (!device || !work || !app)
    throw Error(
      '使用方式：node qa/ios-language-permissions.ts <模拟器ID> <工作目录> <正常App路径>',
    );
  const originalXML = (
    await run('xcrun', ['simctl', 'spawn', device, 'defaults', 'export', '-g', '-'], {
      capture: true,
      signal,
    })
  ).stdout;
  const original: { AppleLanguages?: string[]; AppleLocale?: string } = {};
  for (const key of ['AppleLanguages', 'AppleLocale'] as const) {
    const result = await run(
      'plutil',
      ['-extract', key, key === 'AppleLanguages' ? 'json' : 'raw', '-o', '-', '-'],
      {
        input: originalXML,
        capture: true,
        signal,
      },
    );
    if (key === 'AppleLanguages') {
      const languages = parseJson(result.stdout);
      if (
        !isArray(languages) ||
        !languages.every((language): language is string => typeof language === 'string')
      )
        throw Error('原系统语言读取失败');
      original.AppleLanguages = languages;
    } else original.AppleLocale = result.stdout.trim();
  }
  if (
    !Array.isArray(original.AppleLanguages) ||
    !original.AppleLanguages.length ||
    typeof original.AppleLocale !== 'string' ||
    !original.AppleLocale
  )
    throw Error('原系统语言读取失败，未更改模拟器');
  await mkdir(work, { recursive: true });
  await mkdir(evidence, { recursive: true });
  const rows: { 语言: string; 地区: string; 结果: string; 截图清单: string }[] = [];
  let failure: unknown, restorationFailure: unknown;
  const invoke = (
    command: string,
    args: readonly (string | number)[],
    options: Parameters<typeof execute>[2] = {},
  ) => run(command, args, { signal, ...options });
  const boot = async (restore = false) => {
    const options = restore ? {} : { signal };
    await run('xcrun', ['simctl', 'boot', device], options);
    await run('xcrun', ['simctl', 'bootstatus', device, '-b'], options);
  };
  try {
    for (const [language, locale] of languages) {
      progress('系统权限语言开始 ' + language);
      await invoke('xcrun', [
        'simctl',
        'spawn',
        device,
        'defaults',
        'write',
        '-g',
        'AppleLanguages',
        '-array',
        language,
      ]);
      await invoke('xcrun', [
        'simctl',
        'spawn',
        device,
        'defaults',
        'write',
        '-g',
        'AppleLocale',
        '-string',
        locale,
      ]);
      await invoke('xcrun', ['simctl', 'shutdown', device]);
      await boot();
      await invoke('xcrun', ['simctl', 'uninstall', device, bundle]);
      await invoke('xcrun', ['simctl', 'install', device, app]);
      const result = path.join(work, `ios-permission-${language}.xcresult`);
      await invoke(
        'xcodebuild',
        [
          'test-without-building',
          '-project',
          path.join(work, 'ios-permission-probe/PermissionProbe.xcodeproj'),
          '-scheme',
          'PermissionUI',
          '-only-testing:PermissionUI/PermissionUI/testFirstDenial',
          '-destination',
          `id=${device}`,
          '-derivedDataPath',
          path.join(work, 'ios-permission-probe/build'),
          '-resultBundlePath',
          result,
          'ARCHS=arm64',
          'CODE_SIGNING_ALLOWED=NO',
        ],
        { logPath: path.join(work, `ios-permission-${language}.log`) },
      );
      await invoke('xcrun', [
        'xcresulttool',
        'export',
        'attachments',
        '--path',
        result,
        '--output-path',
        path.join(evidence, `ios-permission-${language}`),
        '--filter',
        '*.png',
      ]);
      rows.push({
        语言: language,
        地区: locale,
        结果: '实际系统弹窗点击拒绝通过',
        截图清单: `ios-permission-${language}/manifest.json`,
      });
      progress('系统权限语言通过 ' + language);
    }
  } catch (error) {
    failure = error;
  } finally {
    try {
      // 恢复操作不继承已取消的信号，只写回本脚本改动的两个键。
      const state = jsonObject(
        (await run('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'], { capture: true }))
          .stdout,
      );
      if (
        !Object.values(objectAt(state, 'devices'))
          .flatMap((value) => recordsAt(value))
          .some((value) => value.udid === device)
      )
        await boot(true);
      await run('xcrun', [
        'simctl',
        'spawn',
        device,
        'defaults',
        'write',
        '-g',
        'AppleLanguages',
        '-array',
        ...original.AppleLanguages,
      ]);
      await run('xcrun', [
        'simctl',
        'spawn',
        device,
        'defaults',
        'write',
        '-g',
        'AppleLocale',
        '-string',
        original.AppleLocale,
      ]);
      await run('xcrun', ['simctl', 'shutdown', device]);
      await boot(true);
    } catch (error) {
      restorationFailure = error;
    }
    const report: {
      时间: string;
      结果: { 语言: string; 地区: string; 结果: string; 截图清单: string }[];
      原系统语言已恢复: false | string[];
      说明: '简体中文另见 ios-permission-denied；本记录只包含系统 UI 和语言，不包含模型内容';
      执行错误?: string;
      恢复错误?: string;
    } = {
      时间: new Date().toISOString(),
      结果: rows,
      原系统语言已恢复: restorationFailure ? false : original.AppleLanguages,
      说明: '简体中文另见 ios-permission-denied；本记录只包含系统 UI 和语言，不包含模型内容',
    };
    if (failure) report.执行错误 = errorInfo(failure).message;
    if (restorationFailure) report.恢复错误 = errorInfo(restorationFailure).message;
    await writeFile(
      path.join(evidence, 'ios-permission-languages.json'),
      JSON.stringify(report, null, 2),
    );
  }
  if (failure && restorationFailure)
    throw new AggregateError([failure, restorationFailure], '验收失败且原系统语言未恢复');
  if (restorationFailure || failure) throw restorationFailure || failure;
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const controller = new AbortController();
  const interrupt = () => controller.abort(Error('用户中断验收'));
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    const [device, work, app] = process.argv.slice(2);
    await runLanguagePermissions({ device, work, app, signal: controller.signal });
  } catch (error) {
    console.error(errorInfo(error).message);
    process.exitCode = controller.signal.aborted ? 130 : 1;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}
