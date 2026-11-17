import { decode, isRecord, isFiniteNumber, parseJson } from '../web/lib/validation.ts';
interface FormatVersions {
  dartLanguageVersion: string;
  ktfmt: { version: string; bytes: number; url: string; sha256: string };
}
const validVersions = (value: unknown): value is FormatVersions =>
  isRecord(value) &&
  typeof value.dartLanguageVersion === 'string' &&
  isRecord(value.ktfmt) &&
  typeof value.ktfmt.version === 'string' &&
  isFiniteNumber(value.ktfmt.bytes) &&
  typeof value.ktfmt.url === 'string' &&
  typeof value.ktfmt.sha256 === 'string';
import type { SpawnSyncOptions } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const toolsDirectory = path.join(root, '.format-tools');
export const versions = decode(
  parseJson(readFileSync(path.join(root, 'tools/format-tools.json'), 'utf8')),
  validVersions,
);

export function executable(name: string, candidates: (string | false | undefined)[] = []) {
  const located = spawnSync('which', [name], { encoding: 'utf8' }).stdout?.trim();
  const found = [...candidates, located].find(
    (p): p is string => typeof p === 'string' && !!p && existsSync(p),
  );
  if (!found) throw Error(`缺少 ${name}，请先按 docs/FORMAT.md 安装格式化工具`);
  return found;
}

export function dartExecutable() {
  const local = path.join(root, 'mobile/android/local.properties');
  const sdk = existsSync(local)
    ? readFileSync(local, 'utf8')
        .match(/^flutter\.sdk=(.+)$/m)?.[1]
        ?.trim()
    : undefined;
  return executable('dart', [
    process.env.DART_BIN,
    process.env.FLUTTER_ROOT && path.join(process.env.FLUTTER_ROOT, 'bin/dart'),
    sdk && path.join(sdk, 'bin/dart'),
  ]);
}

export function run(command: string, args: readonly string[], options: SpawnSyncOptions = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error(
      `格式化工具执行失败（${result.status ?? result.signal}）：${path.basename(command)}`,
    );
}

export function xcodeTool(name: string) {
  const result = spawnSync('xcrun', ['--find', name], { encoding: 'utf8' });
  return executable(name, [result.status === 0 && result.stdout.trim()]);
}
