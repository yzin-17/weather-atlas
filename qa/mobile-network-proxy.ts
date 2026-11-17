import { decode, parseJson, isRecord } from '../web/lib/validation.ts';
import { validAskResult } from '../web/lib/contracts.ts';
import { requireValue } from '../web/lib/validation.ts';
import type { ComparisonRow, LocalPlan } from '../web/lib/types.ts';
export interface NetworkRow {
  phase: string;
  method?: string;
  path: string;
  lat: string | null;
  lon: string | null;
  status: number | null | undefined;
  ask?: {
    decodeError?: boolean;
    code?: string;
    source?: string;
    model?: string;
    modelMs?: number;
    plan?: LocalPlan;
    dateAnchor?: number;
    comparisons?: ComparisonRow[];
  };
}
import http from 'node:http';
import { writeFile } from 'node:fs/promises';
import { gunzipSync, brotliDecompressSync, inflateSync } from 'node:zlib';
const target = new URL(process.env.QA_PROXY_TARGET || 'http://127.0.0.1:3300'),
  port = Number(process.env.QA_PROXY_PORT || 3309);
const run = process.env.QA_PROXY_RUN || 'native-network';
if (!/^[a-z0-9-]+$/.test(run)) throw Error('无效验收名称');
const rows: NetworkRow[] = [];
let phase = 'initial';
const report = () => ({
  at: new Date().toISOString(),
  说明: '原生集成测试的受控 HTTP 记录；控制标记不计入产品请求。坐标均为模拟器／测试选点，不是 RUM 数据；不保存问题正文或认证头。',
  target: target.origin,
  rows,
});
const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/__qa/phase') {
    const name = url.searchParams.get('name');
    if (!/^[a-z-]+$/.test(name || '')) {
      res.writeHead(400).end();
      return;
    }
    phase = requireValue(name);
    res.writeHead(204).end();
    return;
  }
  if (url.pathname === '/__qa/report') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(report()));
    return;
  }
  const row: NetworkRow = {
    phase,
    method: req.method,
    path: url.pathname,
    lat: url.searchParams.get('lat'),
    lon: url.searchParams.get('lon'),
    status: null,
  };
  rows.push(row);
  const upstream = http.request(
    new URL(req.url || '/', target),
    { method: req.method, headers: { ...req.headers, host: target.host } },
    (response) => {
      row.status = response.statusCode;
      if (url.pathname === '/api/ask') {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size <= 1048576) chunks.push(chunk);
        });
        response.on('end', () => {
          try {
            let data = Buffer.concat(chunks);
            const encoding = response.headers['content-encoding'];
            if (encoding === 'gzip') data = gunzipSync(data);
            else if (encoding === 'br') data = brotliDecompressSync(data);
            else if (encoding === 'deflate') data = inflateSync(data);
            const raw = parseJson(data.toString('utf8'));
            if (response.statusCode !== 200) {
              if (!isRecord(raw) || typeof raw.code !== 'string') throw Error('无效问答错误');
              row.ask = { code: raw.code };
              return;
            }
            const body = decode(raw, validAskResult);
            row.ask = {
              source: body.source,
              model: body.model ?? undefined,
              modelMs: body.modelMs ?? undefined,
              plan: body.context?.plan,
              dateAnchor: body.context?.dateAnchor,
              comparisons: body.comparisons,
            };
          } catch {
            row.ask = { decodeError: true };
          }
        });
      }
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
    },
  );
  upstream.on('error', () => {
    row.status = 502;
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
});
server.listen(port, '127.0.0.1', () => console.log('原生验收代理就绪', port));
process.on('SIGTERM', async () => {
  await writeFile(
    new URL(`./evidence/${run}.json`, import.meta.url),
    JSON.stringify(report(), null, 2),
  );
  server.close(() => process.exit(0));
});
