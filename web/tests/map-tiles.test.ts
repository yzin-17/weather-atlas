import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createMapTileService, tileCoordinates } from '../lib/map-tiles.ts';
const body = await sharp({
  create: { width: 256, height: 256, channels: 3, background: '#dce5d9' },
})
  .png()
  .toBuffer();
test('真实瓦片坐标严格限制，非法值不触达上游', () => {
  assert.deepEqual(tileCoordinates('0', '0', '0'), { z: 0, x: 0, y: 0 });
  for (const coords of [
    [20, 0, 0],
    [1, 2, 0],
    [1, 0, 2],
    ['01', 0, 0],
    [1, '-1', 0],
    [1, '../x', 0],
  ])
    assert.throws(
      () => tileCoordinates(coords[0], coords[1], coords[2]),
      (e) => e instanceof Error && 'status' in e && e.status === 400,
    );
});
test('同瓦片并发、跨实例和重启只下载一次；字节与 ETag 一致', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wa-tiles-'));
  let calls = 0;
  const fetcher = async (url: unknown, options: { headers: Record<string, string> }) => {
    calls++;
    assert.equal(url, 'https://tile.openstreetmap.org/7/108/49.png');
    assert.match(options.headers['User-Agent'], /WeatherAtlas/);
    assert.equal(options.headers.Authorization, undefined);
    await new Promise((r) => setTimeout(r, 20));
    return new Response(body, { headers: { 'cache-control': 'public, max-age=604800' } });
  };
  try {
    const a = createMapTileService({ directory, fetcher }),
      b = createMapTileService({ directory, fetcher });
    const all = await Promise.all(
      Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).get(7, 108, 49)),
    );
    assert.equal(calls, 1);
    assert(all.every((r) => r.body.equals(body) && r.etag === all[0].etag));
    const restart = await createMapTileService({ directory, fetcher }).get(7, 108, 49);
    assert.equal(restart.cache, 'HIT');
    assert.equal(calls, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('遵守上游有效期并条件重验，304 不改变图片', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wa-tiles-'));
  let now = 1000,
    calls = 0;
  const fetcher = async (_url: string, options: { headers: { [x: string]: unknown } }) => {
    calls++;
    if (calls === 1)
      return new Response(body, {
        headers: { 'cache-control': 'public, max-age=10', etag: '"provider"' },
      });
    assert.equal(options.headers['If-None-Match'], '"provider"');
    return new Response(null, { status: 304 });
  };
  try {
    const service = createMapTileService({ directory, fetcher, now: () => now });
    const first = await service.get(1, 0, 0);
    now += 5000;
    assert.equal((await service.get(1, 0, 0)).cache, 'HIT');
    now += 6000;
    const revalidated = await service.get(1, 0, 0);
    assert.equal(calls, 2);
    assert.equal(revalidated.cache, 'REVALIDATED');
    assert.equal(revalidated.maxAge, 10);
    assert.equal(revalidated.etag, first.etag);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('登录页／损坏图片不缓存，容量限制能驱逐旧瓦片', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wa-tiles-'));
  let calls = 0;
  try {
    const bad = createMapTileService({
      directory,
      fetcher: async () => {
        calls++;
        return new Response('<html>login</html>');
      },
    });
    await assert.rejects(
      bad.get(1, 0, 0),
      (e) => e instanceof Error && 'status' in e && e.status === 502,
    );
    await assert.rejects(
      bad.get(1, 0, 0),
      (e) => e instanceof Error && 'status' in e && e.status === 502,
    );
    assert.equal(calls, 2);
    assert.equal((await readdir(directory)).filter((n) => n.endsWith('.json')).length, 0);
    const good = createMapTileService({
      directory,
      maxEntries: 2,
      fetcher: async () => new Response(body),
    });
    for (const x of [0, 1, 2]) await good.get(2, x, 0);
    assert.equal((await readdir(directory)).filter((n) => n.endsWith('.json')).length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('正常视野的突发瓦片排队，限制上游并发而不直接拒绝', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wa-tiles-'));
  let active = 0,
    peak = 0;
  try {
    const service = createMapTileService({
      directory,
      fetcher: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 20));
        active--;
        return new Response(body);
      },
    });
    const results = await Promise.all(Array.from({ length: 40 }, (_, x) => service.get(6, x, 0)));
    assert.equal(results.length, 40);
    assert(peak <= 12);
    assert(results.every((r) => r.body.equals(body)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
