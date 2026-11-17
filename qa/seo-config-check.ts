import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const rows: { scenario: string; exit: number | null; explicitConfigurationError: boolean }[] = [];
for (const SITE_URL of ['', 'https://weather.example.org/unexpected-path'] as const) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    SITE_URL,
    NEXT_PUBLIC_SITE_URL: '',
  };
  for (const key of ['AI_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY'] as const)
    delete env[key];
  const result = spawnSync(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--port', '3325'],
    { cwd: new URL('../web/', import.meta.url), env, encoding: 'utf8', timeout: 10000 },
  );
  const output = result.stdout + result.stderr;
  assert.notEqual(result.status, 0);
  assert.equal(result.signal, null);
  assert(output.includes('SITE_URL'));
  rows.push({
    scenario: SITE_URL ? '拒绝含子路径的公开地址' : '拒绝缺失的生产公开地址',
    exit: result.status,
    explicitConfigurationError: true,
  });
}
await writeFile(
  new URL('./evidence/seo-config-check.json', import.meta.url),
  JSON.stringify({ at: new Date().toISOString(), rows }, null, 2),
);
console.log('实际 Next 生产启动在缺失／含子路径的 SITE_URL 时明确失败');
