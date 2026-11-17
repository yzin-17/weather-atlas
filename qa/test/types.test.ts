import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { jsonObject, recordsAt } from '../lib/json.ts';

test('类型审计门禁拒绝 any 传播、断言和检查抑制', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'atlas-type-gate-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    path.join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { strict: true, types: [], target: 'ES2022' },
      include: ['sample.ts'],
    }),
  );
  await mkdir(path.join(directory, 'web'));
  await writeFile(
    path.join(directory, 'web/tsconfig.json'),
    JSON.stringify({
      compilerOptions: { strict: true, types: [], target: 'ES2022' },
      include: ['../sample.ts'],
    }),
  );
  const source =
    'declare const raw: any; const leaked = raw.value; const asserted = {} as {value: number}; const maybe: string | undefined = undefined; const forced = maybe!; let pending!: () => void;\n// @ts-ignore\nconst hidden: number = "wrong";\n';
  await writeFile(path.join(directory, 'sample.ts'), source);
  const output = path.join(directory, 'audit.json');
  const result = spawnSync(process.execPath, ['tools/type-audit.ts'], {
    cwd: new URL('../..', import.meta.url),
    env: { ...process.env, TYPE_AUDIT_ROOT: directory, TYPE_AUDIT_OUTPUT: output },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1, result.stderr);
  const report = jsonObject(await readFile(output, 'utf8'));
  const kinds = new Set(recordsAt(report, 'findings').map((finding) => finding.kind));
  for (const kind of [
    'explicit-any',
    'any-binding',
    'unsafe-any-access',
    'non-null',
    'definite-assignment',
    'narrowing-cast',
    'suppression',
  ])
    assert(kinds.has(kind), kind);
});
