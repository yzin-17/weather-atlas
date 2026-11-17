import { errorInfo } from '../web/lib/errors.ts';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { X509Certificate } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { loadEnvFile } from 'node:process';

// HTTPS、证书下载与后端均为本任务的独立实例，不停止已有的 3300 服务。
const root = fileURLToPath(new URL('..', import.meta.url));
try {
  loadEnvFile(path.join(root, '.env.ai.local'));
} catch (error) {
  if (errorInfo(error).code !== 'ENOENT') throw error;
}
const directory =
  process.env.LOCAL_HTTPS_DIR ||
  path.join(os.homedir(), 'Library/Application Support/Weather Atlas/https');
const ip =
  process.env.LOCAL_HTTPS_IP ||
  Object.entries(os.networkInterfaces())
    .sort(([a], [b]) => Number(b === 'en1') - Number(a === 'en1'))
    .flatMap(([, v]) => v || [])
    .find((v) => v.family === 'IPv4' && !v.internal)?.address;
if (!ip || net.isIP(ip) !== 4) throw Error('未找到局域网 IPv4，请设置 LOCAL_HTTPS_IP');
const port = Number(process.env.LOCAL_HTTPS_PORT || 3443),
  backendPort = Number(process.env.LOCAL_HTTPS_BACKEND_PORT || 3343),
  setupPort = Number(process.env.LOCAL_HTTPS_SETUP_PORT || 3444);
const origin = `https://${ip}:${port}`,
  setupURL = `http://${ip}:${setupPort}`;
const key = await readFile(path.join(directory, 'server-key.pem')),
  cert = await readFile(path.join(directory, 'server.pem'));
const ca = new X509Certificate(await readFile(path.join(directory, 'ca/rootCA.pem')));
if (!new X509Certificate(cert).checkIP(ip))
  throw Error(`证书未包含 ${ip}，请按 LOCAL-HTTPS.md 重新签发`);
await mkdir(path.join(directory, 'logs'), { recursive: true, mode: 0o700 });
await chmod(path.join(directory, 'server-key.pem'), 0o600);

async function vacant(port: number, host: string) {
  const s = net.createServer();
  await new Promise<void>((resolve, reject) => s.once('error', reject).listen(port, host, resolve));
  await new Promise<void>((resolve, reject) =>
    s.close((error) => (error ? reject(error) : resolve())),
  );
}
for (const [p, host] of [
  [port, '0.0.0.0'],
  [backendPort, '127.0.0.1'],
  [setupPort, '0.0.0.0'],
] as const)
  await vacant(p, host);
const env: NodeJS.ProcessEnv = {
  ...process.env,
  WEATHER_MODE: 'live',
  WEATHER_CACHE_DIR: path.join(root, '.weather-cache'),
  SITE_URL: origin,
};
// 保留模型配置；未配置密钥时由 /api/ask 使用规则模式。天气仍使用官方上游。
for (const name of ['WEATHER_FORECAST_URL', 'WEATHER_GEOCODING_URL'] as const) delete env[name];
const backend = spawn(
  process.execPath,
  [
    'node_modules/next/dist/bin/next',
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(backendPort),
  ],
  { cwd: path.join(root, 'web'), env, stdio: ['ignore', 'inherit', 'inherit'] },
);
let closing = false;
const proxy = https.createServer({ key, cert, minVersion: 'TLSv1.2' }, (req, res) => {
  const headers = {
    ...req.headers,
    'x-forwarded-proto': 'https',
    'x-forwarded-host': req.headers.host,
    'x-forwarded-port': String(port),
  };
  const upstream = http.request(
    { hostname: '127.0.0.1', port: backendPort, path: req.url, method: req.method, headers },
    (reply) => {
      res.writeHead(reply.statusCode || 502, reply.headers);
      reply.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('天气服务启动中，请稍后重试。');
  });
  req.on('aborted', () => upstream.destroy());
  res.on('close', () => {
    if (!res.writableEnded) upstream.destroy();
  });
  req.pipe(upstream);
});
const setup = http.createServer((req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (req.url === '/weather-atlas-root-ca.cer') {
    res.writeHead(200, {
      'content-type': 'application/x-x509-ca-cert',
      'content-disposition': 'attachment; filename="weather-atlas-root-ca.cer"',
    });
    res.end(ca.raw);
    return;
  }
  if (req.url !== '/') {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy':
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  });
  res.end(
    `<!doctype html><html lang="zh-Hans"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Weather Atlas 本地 HTTPS</title><style>body{font:17px/1.8 system-ui;max-width:46rem;margin:3rem auto;padding:0 1.2rem;color:#20392b}h1{font-size:1.7rem}a{color:#176b4c}code{overflow-wrap:anywhere}li{margin:.8rem 0}</style><h1>Weather Atlas 本地 HTTPS</h1><p>手机和 Mac 连接同一局域网。此页面只用于安装本机开发证书。</p><ol><li><a href="/weather-atlas-root-ca.cer">下载本地根证书</a></li><li>iPhone：在“设置 → 通用 → VPN 与设备管理”安装已下载的描述文件，再在“通用 → 关于本机 → 证书信任设置”开启该根证书的完全信任。</li><li>Android：在“设置 → 安全与隐私 → 更多安全设置 → 加密与凭据 → 安装证书 → CA 证书”选择下载的文件；不同系统菜单名称可能不同。</li><li>打开 <a href="${origin}/zh-Hans">Weather Atlas HTTPS 首页</a>，按浏览器提示允许访问位置；首页会自动请求当前位置。</li></ol><p>天气使用真实 Open-Meteo 数据。安装证书只建立本地 HTTPS 信任，不会自动授予定位权限。</p><p>根证书 SHA-256 指纹：<br><code>${ca.fingerprint256}</code></p><p>开发完成后，可在手机设置中移除此本地根证书。</p></html>`,
  );
});
function stop(code = 0) {
  if (closing) return;
  closing = true;
  proxy.close();
  setup.close();
  backend.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500).unref();
}
for (const s of [proxy, setup] as const)
  s.on('error', (error: unknown) => {
    console.error(errorInfo(error).message);
    stop(1);
  });
backend.on('exit', (code) => {
  if (!closing) {
    console.error('天气后端退出', code);
    stop(1);
  }
});
process.on('SIGTERM', () => stop());
process.on('SIGINT', () => stop());
await new Promise<void>((resolve) => proxy.listen(port, '0.0.0.0', resolve));
await new Promise<void>((resolve) => setup.listen(setupPort, '0.0.0.0', resolve));
await writeFile(
  path.join(directory, 'runtime.json'),
  JSON.stringify(
    {
      startedAt: new Date().toISOString(),
      pid: process.pid,
      backendPid: backend.pid,
      origin,
      setupURL,
      backend: `http://127.0.0.1:${backendPort}`,
      weatherMode: 'live',
      caFingerprint: ca.fingerprint256,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    HTTPS: origin,
    手机证书安装页: setupURL,
    天气模式: 'live',
    根证书指纹: ca.fingerprint256,
  }),
);
