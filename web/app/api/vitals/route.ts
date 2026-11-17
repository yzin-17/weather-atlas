import type { MetricRow } from '../../../lib/rum.ts';
import { createSharedStore, sharedLimiter } from '../../../lib/shared-store.ts';
import { validateMetric, validMetricRow } from '../../../lib/rum.ts';
import { parseJson, isArray } from '../../../lib/validation.ts';
const store = createSharedStore();
const allowed = sharedLimiter({ store, key: 'rum-budget', limit: 600 });
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (Number(request.headers.get('content-length')) > 2048)
    return new Response(null, { status: 413 });
  const origin = request.headers.get('origin');
  // Next 的内部 URL 可为 localhost；浏览器仍应按实际 Host 校验同源。
  if (origin) {
    let source: URL;
    try {
      source = new URL(origin);
    } catch {
      return new Response(null, { status: 403 });
    }
    const actual = new URL(request.url),
      host = request.headers.get('host') || actual.host;
    if (source.host !== host || source.protocol !== actual.protocol)
      return new Response(null, { status: 403 });
  }
  try {
    // Bound streaming bodies as well as declared content-length.
    const reader = request.body?.getReader();
    if (!reader) throw Error();
    let size = 0,
      chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2048) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(value);
    }
    const metric = validateMetric(parseJson(Buffer.concat(chunks).toString('utf8')));
    if (!(await allowed())) return new Response(null, { status: 429 });
    const date = new Date().toISOString().slice(0, 10),
      key = 'rum:' + date;
    await store.lock(key, async () => {
      let rows =
        (await store.read(
          key,
          (value): value is MetricRow[] => isArray(value) && value.every(validMetricRow),
        )) || [];
      const dataset = process.env.RUM_ENVIRONMENT || 'production';
      rows = rows.filter((r) => r.id !== metric.id || r.name !== metric.name);
      rows.push({ ...metric, receivedAt: Date.now(), dataset });
      await store.write(key, rows.slice(-10000));
    });
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return new Response(null, { status: 400 });
  }
}
