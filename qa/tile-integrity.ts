import { errorInfo } from '../web/lib/errors.ts';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const report: {
  at: string;
  local: {
    lang: 'zh-Hans' | 'zh-Hant' | 'en' | 'ko';
    url: string;
    bytes: number;
    sha256: string;
    sameURLStable: true;
    style: string | null;
  }[];
  osm:
    | null
    | {
        url: string;
        rows: { status: number; type: string | null; sha256: string }[];
        sameURLStable: boolean;
      }
    | { url: string; error: string };
} = { at: new Date().toISOString(), local: [], osm: null };
const hash = (body: string | NodeJS.ArrayBufferView<ArrayBufferLike> | Buffer<ArrayBuffer>) =>
  createHash('sha256').update(body).digest('hex');
for (const lang of ['zh-Hans', 'zh-Hant', 'en', 'ko'] as const) {
  const url = `http://127.0.0.1:3300/api/tiles/${lang}/7/109/49`,
    bodies: Buffer<ArrayBuffer>[] = [],
    styles: (string | null)[] = [];
  for (let n = 0; n < 2; n++) {
    const r = await fetch(url, { cache: 'no-store' });
    assert.equal(r.status, 200);
    bodies.push(Buffer.from(await r.arrayBuffer()));
    styles.push(r.headers.get('x-map-style'));
  }
  assert.equal(hash(bodies[0]), hash(bodies[1]));
  assert(styles.every((s) => s === lang));
  report.local.push({
    lang,
    url,
    bytes: bodies[0].length,
    sha256: hash(bodies[0]),
    sameURLStable: true,
    style: styles[0],
  });
}
assert.equal(new Set(report.local.map((r) => r.sha256)).size, 4);
const url = 'https://tile.openstreetmap.org/7/109/49.png';
try {
  const rows: { status: number; type: string | null; sha256: string }[] = [];
  for (let n = 0; n < 2; n++) {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'WeatherAtlas-LocalVerification/1.1 (manual two-request cache comparison)',
      },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    rows.push({
      status: r.status,
      type: r.headers.get('content-type'),
      sha256: hash(Buffer.from(await r.arrayBuffer())),
    });
  }
  report.osm = {
    url,
    rows,
    sameURLStable:
      rows.every((r) => r.status === 200 && r.type?.includes('image/png')) &&
      rows[0].sha256 === rows[1].sha256,
  };
} catch (e) {
  report.osm = { url, error: errorInfo(e).name };
}
await writeFile(
  new URL('./evidence/tile-integrity.json', import.meta.url),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
