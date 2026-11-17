interface TileRecord {
  at: number;
  expires: number;
  body?: string;
  png: Buffer;
  etag: string;
  cacheControl: string | null;
  providerETag: string | null;
}
interface TileResult {
  body: Buffer;
  etag: string;
  cache: string;
  cacheControl: string | null;
  maxAge: number;
}
import { isRecord, isFiniteNumber as finite } from './validation.ts';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createSharedStore, cacheDirectory } from './shared-store.ts';
import { siteOrigin } from './site-config.ts';
import { trace } from './trace.ts';
const WEEK = 7 * 86400;
export function tileCoordinates(z: unknown, x?: unknown, y?: unknown) {
  const parts = [z, x, y].map(String);
  if (!parts.every((p) => /^(0|[1-9]\d*)$/.test(p)))
    throw Object.assign(Error('Invalid tile'), { status: 400 });
  const [zoom, column, row] = parts.map(Number);
  if (zoom > 19 || column >= 2 ** zoom || row >= 2 ** zoom)
    throw Object.assign(Error('Invalid tile'), { status: 400 });
  return { z: zoom, x: column, y: row };
}
function png(buffer: Buffer) {
  return (
    buffer.length >= 45 &&
    buffer.length <= 1024 * 1024 &&
    buffer.toString('hex', 0, 8) === '89504e470d0a1a0a' &&
    buffer.readUInt32BE(16) === 256 &&
    buffer.readUInt32BE(20) === 256 &&
    buffer.toString('hex', buffer.length - 12) === '0000000049454e44ae426082'
  );
}
function lifetime(headers: Headers) {
  const cc = headers.get('cache-control') || '';
  if (/no-store|no-cache/.test(cc)) return 0;
  const match = cc.match(/max-age=(\d+)/);
  return match ? Math.min(Number(match[1]), 30 * 86400) : WEEK;
}
export function createMapTileService({
  directory = path.join(cacheDirectory(), 'map-tiles'),
  fetcher = fetch,
  now = Date.now,
  maxEntries = 512,
  maxBytes = 64 * 1024 * 1024,
}: {
  directory?: string;
  fetcher?: (
    url: string,
    options: { headers: Record<string, string>; signal: AbortSignal; cache: RequestCache },
  ) => Promise<Response>;
  now?: () => number;
  maxEntries?: number;
  maxBytes?: number;
} = {}) {
  const store = createSharedStore(directory),
    pending = new Map<string, Promise<TileResult>>(),
    memory = new Map<string, TileRecord>();
  let memoryBytes = 0,
    active = 0;
  const waiters: { resolve: () => void }[] = [];
  async function acquire() {
    if (active < 12) {
      active++;
      return;
    }
    if (waiters.length >= 128) throw Object.assign(Error('Map busy'), { status: 503 });
    await new Promise<void>((resolve, reject) => {
      const waiter = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
      };
      const timer = setTimeout(() => {
        const at = waiters.indexOf(waiter);
        if (at >= 0) waiters.splice(at, 1);
        reject(Object.assign(Error('Map busy'), { status: 503 }));
      }, 10000);
      waiters.push(waiter);
    });
  }
  function release() {
    const waiter = waiters.shift();
    if (waiter) waiter.resolve();
    else active--;
  }
  function remember(key: string, record: TileRecord) {
    const existing = memory.get(key);
    if (existing) memoryBytes -= existing.png.length;
    memory.delete(key);
    const { body: _encodedBody, ...cached } = record;
    memory.set(key, cached);
    memoryBytes += record.png.length;
    while (memory.size > 128 || memoryBytes > 8 * 1024 * 1024) {
      const first = memory.entries().next();
      if (first.done) break;
      memoryBytes -= first.value[1].png.length;
      memory.delete(first.value[0]);
    }
  }
  function unpack(raw: unknown): TileRecord | null {
    if (
      !isRecord(raw) ||
      typeof raw.body !== 'string' ||
      !finite(raw.at) ||
      !finite(raw.expires) ||
      typeof raw.etag !== 'string' ||
      (raw.cacheControl !== null && typeof raw.cacheControl !== 'string') ||
      (raw.providerETag !== null && typeof raw.providerETag !== 'string')
    )
      return null;
    const value = {
      body: raw.body,
      at: raw.at,
      expires: raw.expires,
      etag: raw.etag,
      cacheControl: raw.cacheControl,
      providerETag: raw.providerETag,
    };
    const buffer = Buffer.from(value.body, 'base64');
    return png(buffer) ? { ...value, png: buffer } : null;
  }
  const fresh = (record: TileRecord | null | undefined): boolean =>
    !!record && record.at <= now() && record.expires > now();
  async function prune() {
    await store.lock('prune', async () => {
      const files = (await fs.readdir(/* turbopackIgnore: true */ directory)).filter((name) =>
        name.endsWith('.json'),
      );
      const rows = await Promise.all(
        files.map(async (name) => {
          const file = path.join(/* turbopackIgnore: true */ directory, name),
            stat = await fs.stat(file);
          return { file, size: stat.size, at: stat.mtimeMs };
        }),
      );
      rows.sort((a, b) => b.at - a.at);
      let bytes = 0;
      for (let i = 0; i < rows.length; i++) {
        bytes += rows[i].size;
        if (i >= maxEntries || bytes > maxBytes) await fs.rm(rows[i].file, { force: true });
      }
    });
  }
  async function get(z: unknown, x: unknown, y: unknown): Promise<TileResult> {
    const tile = tileCoordinates(z, x, y),
      key = `osm-v1:${tile.z}/${tile.x}/${tile.y}`;
    const result = (record: TileRecord, cache: string): TileResult => ({
      body: record.png,
      etag: record.etag,
      cache,
      cacheControl: /no-store/.test(record.cacheControl || '') ? 'no-store' : null,
      maxAge: Math.max(0, Math.floor((record.expires - now()) / 1000)),
    });
    const warm = memory.get(key);
    if (warm && fresh(warm)) {
      remember(key, warm);
      return result(warm, 'HIT');
    }
    const running = pending.get(key);
    if (running) return running;
    const task = store
      .lock(key, async () => {
        const stored = unpack(await store.read(key));
        if (stored && fresh(stored)) {
          remember(key, stored);
          return result(stored, 'HIT');
        }
        await acquire();
        const started = performance.now();
        let received = false;
        try {
          const headers: Record<string, string> = {
            'User-Agent': `WeatherAtlas/1.1.2 (+${siteOrigin()})`,
            Referer: siteOrigin() + '/',
          };
          if (stored?.providerETag) headers['If-None-Match'] = stored.providerETag;
          const response = await fetcher(
            `https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`,
            { headers, signal: AbortSignal.timeout(8000), cache: 'no-store' },
          );
          received = true;
          trace('map-tile-upstream', {
            status: response.status,
            ms: Math.round(performance.now() - started),
          });
          let body: Buffer;
          if (response.status === 304 && stored) body = stored.png;
          else {
            if (!response.ok) throw Error('Map upstream unavailable');
            const chunks: Uint8Array[] = [];
            let size = 0;
            for await (const chunk of response.body || []) {
              size += chunk.length;
              if (size > 1024 * 1024) throw Error('Map tile too large');
              chunks.push(chunk);
            }
            body = Buffer.concat(chunks);
          }
          if ((response.status !== 304 && !response.ok) || !png(body))
            throw Error('Map upstream unavailable');
          const cacheHeaders = new Headers(response.headers);
          if (response.status === 304 && !cacheHeaders.has('cache-control') && stored?.cacheControl)
            cacheHeaders.set('cache-control', stored.cacheControl);
          const seconds = lifetime(cacheHeaders),
            at = now();
          const record = {
            body: body.toString('base64'),
            png: body,
            at,
            expires: at + seconds * 1000,
            etag: '"' + createHash('sha256').update(body).digest('hex') + '"',
            cacheControl: cacheHeaders.get('cache-control'),
            providerETag: response.headers.get('etag') || stored?.providerETag || null,
          };
          if (!/no-store/.test(response.headers.get('cache-control') || '')) {
            const { png: _, ...serialized } = record;
            await store.write(key, serialized);
            remember(key, record);
            await prune();
          }
          return result(record, response.status === 304 ? 'REVALIDATED' : 'MISS');
        } catch (error) {
          if (!received)
            trace('map-tile-upstream', { status: 0, ms: Math.round(performance.now() - started) });
          if (error && typeof error === 'object' && 'status' in error) throw error;
          throw Object.assign(Error('Map upstream unavailable'), { status: 502 });
        } finally {
          release();
        }
      })
      .finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  }
  return { get };
}
const singleton = Symbol.for('weather-atlas.map-tiles.v1');
const globalServices: typeof globalThis & {
  [singleton]?: ReturnType<typeof createMapTileService>;
} = globalThis;
const service = (globalServices[singleton] ??= createMapTileService());
export const getMapTile = (...args: Parameters<ReturnType<typeof createMapTileService>['get']>) =>
  service.get(...args);
