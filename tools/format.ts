import type { ExecFileSyncOptions } from 'node:child_process';
import { errorInfo } from '../web/lib/errors.ts';
import { existsSync, type PathLike } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {
  root,
  toolsDirectory,
  versions,
  executable,
  dartExecutable,
  xcodeTool,
  run,
} from './format-runtime.ts';

const mode = process.argv[2];
if (!['write', 'check', 'staged'].includes(mode))
  throw Error('使用方式：npm run format、format:check 或 format:staged');
const git = (args: readonly string[], options: ExecFileSyncOptions = {}) =>
  execFileSync('git', args, { cwd: root, ...options });
const names = [
  ...new Set(
    git(
      mode === 'staged'
        ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
        : ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    )
      .toString()
      .split('\0')
      .filter(Boolean),
  ),
];

function group(name: string) {
  if (
    name.startsWith('qa/evidence/') ||
    name === 'qa/map-loading-ab.json' ||
    /(?:^|\/)(?:node_modules|build|Pods|\.git|\.dart_tool|\.gradle|\.format-tools|\.symlinks|ephemeral|\.next[^/]*|\.cache[^/]*|\.weather-cache[^/]*)(?:\/|$)/.test(
      name,
    ) ||
    /(?:^|\/)(?:package-lock\.json|GeneratedPluginRegistrant\.[^/]+)$/.test(name)
  )
    return null;
  if (/\.(?:[cm]?[jt]sx?|jsonc?|json5|css|scss|less|ya?ml|html)$/.test(name)) return 'oxfmt';
  if (name.endsWith('.dart')) return 'dart';
  if (name.endsWith('.swift')) return 'swift';
  if (/\.kts?$/.test(name)) return 'kotlin';
  if (/(?:^|\/)Podfile$/.test(name)) return 'ruby-config';
  if (/\.(?:h|m|mm|c|cc|cpp)$/.test(name)) return 'clang';
  return null;
}
const selected = names.filter(
  (name) => group(name) && (mode === 'staged' || existsSync(path.join(root, name))),
);
let snapshot: string | undefined;
try {
  if (mode === 'staged' && selected.length) {
    // 只导出索引快照；不 stash、改写工作区或自动 git add，支持首次提交与部分暂存。
    snapshot = await mkdtemp(path.join(os.tmpdir(), 'weather-atlas-format-'));
    const configs = git([
      'ls-files',
      '-z',
      '--',
      '.oxfmtrc.json',
      '.swift-format.json',
      '.clang-format',
      '.editorconfig',
      'tools/format-tools.json',
    ])
      .toString()
      .split('\0')
      .filter(Boolean);
    const exported = [...new Set([...selected, ...configs])];
    git(['checkout-index', '--prefix=' + snapshot + path.sep, '-z', '--stdin'], {
      input: Buffer.from(exported.join('\0') + '\0'),
    });
  }
  const config = (name: string) =>
    snapshot && existsSync(path.join(snapshot, name))
      ? path.join(snapshot, name)
      : path.join(root, name);
  const groups = Map.groupBy(selected, group);
  for (const [name, paths] of groups) {
    console.log(
      `${mode === 'write' && name !== 'ruby-config' ? '格式化' : '校验'} ${name}：${paths.length} 个文件`,
    );
    const files = paths.map((p: string) => path.join(snapshot || root, p));
    const check = mode !== 'write';
    if (name === 'oxfmt')
      run(process.execPath, [
        path.join(root, 'node_modules/oxfmt/bin/oxfmt'),
        '--config',
        config('.oxfmtrc.json'),
        ...(check ? ['--check'] : ['--write']),
        ...files,
      ]);
    if (name === 'dart')
      run(dartExecutable(), [
        'format',
        '--language-version=' + versions.dartLanguageVersion,
        ...(check ? ['--output=none', '--set-exit-if-changed'] : []),
        ...files,
      ]);
    if (name === 'swift')
      run(xcodeTool('swift-format'), [
        check ? 'lint' : 'format',
        ...(check ? ['--strict'] : ['--in-place']),
        '--configuration',
        config('.swift-format.json'),
        ...files,
      ]);
    if (name === 'kotlin') {
      const java = executable('java', [
        process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin/java'),
        '/opt/homebrew/opt/openjdk@21/bin/java',
      ]);
      run(java, [
        '-Xmx512m',
        '-jar',
        path.join(toolsDirectory, `ktfmt-${versions.ktfmt.version}.jar`),
        '--kotlinlang-style',
        ...(check ? ['--dry-run', '--set-exit-if-changed'] : []),
        ...files,
      ]);
    }
    if (name === 'ruby-config') {
      const ruby = executable('ruby', [process.env.RUBY_BIN, '/opt/homebrew/opt/ruby/bin/ruby']);
      for (const file of files) run(ruby, ['-c', file]);
    }
    if (name === 'clang')
      run(xcodeTool('clang-format'), [
        '--style=file:' + config('.clang-format'),
        ...(check ? ['--dry-run', '--Werror'] : ['-i']),
        ...files,
      ]);
  }
  console.log(`格式${mode === 'write' ? '化' : '校验'}通过：${selected.length} 个文件`);
} catch (error) {
  console.error(errorInfo(error).message);
  process.exitCode = 1;
} finally {
  if (snapshot) await rm(snapshot, { recursive: true, force: true });
}
