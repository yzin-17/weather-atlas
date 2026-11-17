import { jsonObject, recordsAt, textAt, objectAt } from '../lib/json.ts';
import { requireValue } from '../../web/lib/validation.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { generatePermissionProject } from '../ios-permission-project.ts';
import { runLanguagePermissions } from '../ios-language-permissions.ts';
import { execute } from '../lib/command.ts';

async function temporary(t: test.TestContext) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'weather-node-native-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
async function scenario(
  t: test.TestContext,
  { fail, restoreFail, cancel }: { fail?: boolean; restoreFail?: boolean; cancel?: boolean } = {},
) {
  const directory = await temporary(t),
    calls: {
      command: string;
      args: readonly (string | number)[];
      signal: AbortSignal | undefined;
    }[] = [],
    device = 'controlled-device',
    controller = new AbortController();
  const run = async (
    command: string,
    args: readonly (string | number)[],
    options: Parameters<typeof execute>[2] = {},
  ) => {
    calls.push({ command, args, signal: options.signal });
    if (command === 'plutil')
      return {
        stdout: args[1] === 'AppleLanguages' ? JSON.stringify(['zh-Hans', 'en']) : 'zh_CN\n',
      };
    if (args.includes('export')) return { stdout: 'controlled plist XML' };
    if (
      command === 'xcodebuild' &&
      fail &&
      args.some((value) => String(value).endsWith('ios-permission-zh-Hant.xcresult'))
    )
      throw Error('受控测试失败');
    if (command === 'xcodebuild' && cancel) {
      controller.abort();
      throw Error('受控中断');
    }
    if (restoreFail && args.includes('AppleLocale') && args.at(-1) === 'zh_CN')
      throw Error('受控恢复失败');
    if (args.includes('booted'))
      return { stdout: JSON.stringify({ devices: { runtime: [{ udid: device }] } }) };
    return { stdout: '' };
  };
  const options = {
    device,
    work: path.join(directory, 'work space'),
    app: '/controlled/Runner.app',
    evidence: path.join(directory, 'evidence'),
    run,
    signal: controller.signal,
    progress: () => {},
  };
  return {
    calls,
    options,
    directory,
    report: async () =>
      jsonObject(
        await readFile(path.join(options.evidence, 'ios-permission-languages.json'), 'utf8'),
      ),
  };
}

test('Node 生成原生 XCTest 工程，并保留输入 Swift 内容', async (t) => {
  const directory = await temporary(t),
    source = path.join(directory, 'source.swift'),
    content = 'import XCTest\nfinal class PermissionUI: XCTestCase {}\n';
  await writeFile(source, content);
  const project = await generatePermissionProject(
    path.join(directory, 'project with spaces'),
    source,
  );
  assert.equal(
    await readFile(path.join(directory, 'project with spaces/PermissionUI.swift'), 'utf8'),
    content,
  );
  const pbx = await readFile(path.join(project, 'project.pbxproj'), 'utf8');
  assert(pbx.includes('com.apple.product-type.bundle.ui-testing'));
  assert(pbx.includes('XCTest.framework'));
  assert(!pbx.includes('/Users/'));
  if (process.platform === 'darwin') {
    const parsed = jsonObject(
      execFileSync(
        'plutil',
        ['-convert', 'json', '-o', '-', path.join(project, 'project.pbxproj')],
        { encoding: 'utf8' },
      ),
    );
    const targets = Object.values(objectAt(parsed, 'objects'))
      .map((value) => objectAt(value))
      .filter((value) => value.isa === 'PBXNativeTarget');
    assert.deepEqual(targets.map((value) => value.name).sort(), ['PermissionUI', 'Probe']);
    const scheme = await readFile(
      path.join(project, 'xcshareddata/xcschemes/PermissionUI.xcscheme'),
      'utf8',
    );
    for (const [id, value] of Object.entries(objectAt(parsed, 'objects')).map(
      ([id, value]) => [id, objectAt(value)] as const,
    ))
      if (value.isa === 'PBXNativeTarget') assert(scheme.includes(id));
  }
});

test('Swift 输入不存在时不生成半成品工程', async (t) => {
  const directory = await temporary(t),
    output = path.join(directory, 'output');
  await assert.rejects(
    generatePermissionProject(output, path.join(directory, 'missing.swift')),
    /ENOENT/,
  );
  await assert.rejects(readFile(path.join(output, 'Probe.swift')), /ENOENT/);
});

test(
  'macOS plutil 以 JSON 读取数组、以 raw 读取标量',
  { skip: process.platform !== 'darwin' },
  async () => {
    const input =
      '<?xml version="1.0"?><plist version="1.0"><dict><key>AppleLanguages</key><array><string>zh-Hans</string></array><key>AppleLocale</key><string>zh_CN</string></dict></plist>';
    const languages = await execute(
      'plutil',
      ['-extract', 'AppleLanguages', 'json', '-o', '-', '-'],
      { input, capture: true },
    );
    const locale = await execute('plutil', ['-extract', 'AppleLocale', 'raw', '-o', '-', '-'], {
      input,
      capture: true,
    });
    assert.deepEqual(JSON.parse(languages.stdout), ['zh-Hans']);
    assert.equal(locale.stdout.trim(), 'zh_CN');
  },
);

test('三语权限验收命令和输出保持一致，只恢复两个原语言键', async (t) => {
  const s = await scenario(t);
  await runLanguagePermissions(s.options);
  const report = await s.report();
  assert.deepEqual(
    recordsAt(report, '结果').map((value) => value.语言),
    ['en', 'zh-Hant', 'ko'],
  );
  assert.deepEqual(report.原系统语言已恢复, ['zh-Hans', 'en']);
  const writes = s.calls.filter(
    (value: { args: readonly (string | number)[]; signal?: AbortSignal }) =>
      value.args.includes('write'),
  );
  assert.equal(writes.length, 8);
  assert(
    writes.every(
      (value) => value.args.includes('AppleLanguages') || value.args.includes('AppleLocale'),
    ),
  );
  assert.deepEqual(requireValue(writes.at(-2)).args.slice(-2), ['zh-Hans', 'en']);
  assert.equal(requireValue(writes.at(-1)).args.at(-1), 'zh_CN');
  assert.equal(s.calls.filter((value) => value.command === 'xcodebuild').length, 3);
  assert.equal(s.calls.filter((value) => value.args.includes('attachments')).length, 3);
});

test('中途失败保留已完成结果并恢复原语言', async (t) => {
  const s = await scenario(t, { fail: true });
  await assert.rejects(runLanguagePermissions(s.options), /受控测试失败/);
  const report = await s.report();
  assert.equal(recordsAt(report, '结果').length, 1);
  assert.deepEqual(report.原系统语言已恢复, ['zh-Hans', 'en']);
  assert.match(textAt(report, '执行错误'), /受控测试失败/);
});

test('恢复失败不报告恢复成功', async (t) => {
  const s = await scenario(t, { restoreFail: true });
  await assert.rejects(runLanguagePermissions(s.options), /受控恢复失败/);
  const report = await s.report();
  assert.equal(report.原系统语言已恢复, false);
  assert.match(textAt(report, '恢复错误'), /受控恢复失败/);
});

test('中断后仍能执行不带取消信号的恢复操作', async (t) => {
  const s = await scenario(t, { cancel: true });
  await assert.rejects(runLanguagePermissions(s.options), /受控中断/);
  assert.deepEqual((await s.report()).原系统语言已恢复, ['zh-Hans', 'en']);
  const writes = s.calls.filter((value) => value.args.includes('write')).slice(-2);
  assert(writes.every((value) => value.signal === undefined));
});

test('原语言读取无效时不改写模拟器', async (t) => {
  const s = await scenario(t);
  const originalRun = s.options.run;
  s.options.run = async (command, args, options) =>
    command === 'plutil' ? { stdout: 'null' } : originalRun(command, args, options);
  await assert.rejects(runLanguagePermissions(s.options), /原系统语言读取失败/);
  assert.equal(s.calls.filter((value) => value.args.includes('write')).length, 0);
});

test('原生命令使用参数数组，支持标准输入、捕获输出和失败日志', async (t) => {
  const directory = await temporary(t),
    literal = '空格与分号;$(不会执行)';
  const result = await execute(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], {
    input: literal,
    capture: true,
  });
  assert.equal(result.stdout, literal);
  const logPath = path.join(directory, 'failed command.log');
  await assert.rejects(
    execute(
      process.execPath,
      ['-e', 'console.log("stdout");console.error("stderr");process.exit(7)'],
      { logPath },
    ),
    /7/,
  );
  const text = await readFile(logPath, 'utf8');
  assert(text.includes('stdout') && text.includes('stderr'));
});
