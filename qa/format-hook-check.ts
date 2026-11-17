import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { root } from '../tools/format-runtime.ts';

// 使用独立 Git 元数据；不提交、不暂存用户文件，不接触真实索引。
const directory = await mkdtemp(path.join(os.tmpdir(), 'weather-format-hook-'));
const probe = `qa/.format hook probe ${randomUUID()}.ts`;
const probePath = path.join(root, probe);
const git = (args: readonly string[], options = {}) =>
  execFileSync('git', args, { cwd: root, ...options });
const originalIndex = git(['ls-files', '--stage', '-z']);
git(['init', '--quiet', '--initial-branch=main', directory]);
const env = { ...process.env, GIT_DIR: path.join(directory, '.git'), GIT_WORK_TREE: root };
const isolatedGit = (args: readonly string[], options = {}) => git(args, { env, ...options });
const report: {
  at: string;
  checks: (
    | { name: string; exitCode: number | null; worktreeAndIndexPreserved: true }
    | { name: string; exitCode: number; sourceFilesInTemporaryIndex: number }
  )[];
  realIndexPreserved?: true;
} = { at: new Date().toISOString(), checks: [] };
function stage(name: string, content: string | NonSharedBuffer) {
  const object = isolatedGit(['hash-object', '-w', '--stdin'], { input: content })
    .toString()
    .trim();
  isolatedGit(['update-index', '--add', '--cacheinfo', '100644', object, name]);
}
async function check(
  name: string,
  staged: string,
  working:
    | string
    | NodeJS.ArrayBufferView<ArrayBufferLike>
    | Iterable<string | NodeJS.ArrayBufferView<ArrayBufferLike>>
    | AsyncIterable<string | NodeJS.ArrayBufferView<ArrayBufferLike>>,
  expected: boolean,
) {
  stage(probe, staged);
  await writeFile(probePath, working);
  const result = spawnSync(
    'git',
    ['-c', `core.hooksPath=${path.join(root, '.husky/_')}`, 'hook', 'run', 'pre-commit'],
    { cwd: root, env, encoding: 'utf8' },
  );
  assert.equal(result.status === 0, expected, `${name}\n${result.stdout}\n${result.stderr}`);
  assert.equal(await readFile(probePath, 'utf8'), working, '钩子改写了工作区');
  assert.equal(isolatedGit(['show', ':' + probe]).toString(), staged, '钩子改写了索引');
  report.checks.push({ name, exitCode: result.status, worktreeAndIndexPreserved: true });
}
try {
  const formatted = 'const value = { ready: true };\n';
  const unformatted = 'const value={ready:true}\n';
  await check('首次提交：暂存未格式化、工作区已格式化，必须拦截', unformatted, formatted, false);
  await check(
    '仅暂存内容已格式化、工作区另有修改，应通过且保留工作区',
    formatted,
    unformatted,
    true,
  );
  await check('语法错误必须拦截', 'export const = ;\n', formatted, false);
  stage(
    '.oxfmtrc.json',
    JSON.stringify({ printWidth: 40, tabWidth: 2, semi: true, singleQuote: true }, null, 2) + '\n',
  );
  const wider = 'export const settings = { alpha: true, beta: true, gamma: true };\n';
  await check('使用暂存的格式配置，不能被工作区配置掩盖', wider, wider, false);
  await rm(probePath);
  isolatedGit(['read-tree', '--empty']);
  // 已有索引时只验证待提交快照，避免把其他未暂存业务改动加入测试。
  const indexed = git(['ls-files', '--cached', '-z']).toString().split('\0').filter(Boolean);
  const sourceNames = (
    indexed.length
      ? indexed.join('\0')
      : git(['ls-files', '--others', '--exclude-standard', '-z']).toString()
  )
    .toString()
    .split('\0')
    .filter(
      (name) =>
        name &&
        !name.startsWith('qa/evidence/') &&
        (/\.(?:[cm]?[jt]sx?|json|jsonc|json5|css|ya?ml|dart|swift|kts?|h)$/.test(name) ||
          ['mobile/ios/Podfile', '.editorconfig', '.clang-format'].includes(name)),
    );
  for (const name of sourceNames)
    stage(name, indexed.length ? git(['show', ':' + name]) : await readFile(path.join(root, name)));
  const entire = spawnSync(
    'git',
    ['-c', `core.hooksPath=${path.join(root, '.husky/_')}`, 'hook', 'run', 'pre-commit'],
    { cwd: root, env, encoding: 'utf8' },
  );
  assert.equal(entire.status, 0, `${entire.stdout}\n${entire.stderr}`);
  report.checks.push({
    name: '完整源码首次暂存：所有语言的索引快照检查通过',
    exitCode: 0,
    sourceFilesInTemporaryIndex: sourceNames.length,
  });
  assert.deepEqual(git(['ls-files', '--stage', '-z']), originalIndex);
  report.realIndexPreserved = true;
  console.log(JSON.stringify(report));
  await mkdir(path.join(root, 'qa/evidence'), { recursive: true });
  await writeFile(path.join(root, 'qa/evidence/format-hook.json'), JSON.stringify(report, null, 2));
} finally {
  await rm(probePath, { force: true });
  await rm(directory, { recursive: true, force: true });
}
