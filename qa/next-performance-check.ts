import { ChildProcess, spawn } from 'node:child_process';
import { open, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = {
  ...process.env,
  AI_API_KEY: '',
  OPENAI_API_KEY: '',
  OPENROUTER_API_KEY: '',
  NEXT_DIST_DIR: process.env.QA_DIST_DIR || '.next-perf-after',
  SITE_URL: 'http://localhost:3300',
  WEATHER_MODE: 'live',
  WEATHER_FORECAST_URL: 'http://127.0.0.1:3333/forecast',
  FIXTURE_PORT: '3333',
  WEATHER_CACHE_DIR: await mkdtemp(path.join(tmpdir(), 'wa-perf-check-')),
  APP_URL: 'http://127.0.0.1:3332',
  QA_AUDIT_RUN: 'next-performance-seo-controlled',
  QA_HOME_BROWSER_RUN: 'next-performance-home',
  QA_WEATHER_LABEL: '受控天气上游；不代表实时天气',
};
async function launch(args: readonly string[], cwd: string, log: string) {
  const fd = await open(path.join(root, 'qa/evidence', log), 'a');
  const p = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', fd.fd, fd.fd] });
  await fd.close();
  return p;
}
async function ready(url: string | URL | Request, p: ChildProcess) {
  for (let i = 0; i < 100; i++) {
    if (p.exitCode !== null) throw Error('QA 进程提前退出');
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error('QA 实例未就绪');
}
async function stop(p: ChildProcess | undefined) {
  if (!p || p.exitCode !== null) return;
  const done = new Promise((r) => p.once('exit', r));
  p.kill();
  await done;
}
const fixture = await launch(
  ['qa/upstream-fixture.ts'],
  root,
  'next-performance-check-fixture.log',
);
let server: import('node:child_process').ChildProcess | undefined;
try {
  await ready('http://127.0.0.1:3333/stats', fixture);
  server = await launch(
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '0.0.0.0', '--port', '3332'],
    path.join(root, 'web'),
    'next-performance-check-server.log',
  );
  await ready(env.APP_URL + '/robots.txt', server);
  for (const script of (
    process.env.QA_PERF_CHECKS ||
    'next-performance-browser,seo-audit,home-index-browser,ask-draft-check'
  ).split(',')) {
    const proc = spawn(process.execPath, [`qa/${script}.ts`], {
      cwd: root,
      env,
      stdio: 'inherit',
    });
    const code = await new Promise((r) => proc.once('exit', r));
    if (code) throw Error(`${script} 失败：${code}`);
    console.log(`${script} 完成`);
  }
} finally {
  await stop(server);
  await stop(fixture);
}
