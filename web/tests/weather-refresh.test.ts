import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('explicit API refresh waits for an aged snapshot and still reuses fresh cache', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'atlas-api-refresh-'));
  const oldMode = process.env.WEATHER_MODE;
  const oldDirectory = process.env.WEATHER_CACHE_DIR;
  process.env.WEATHER_MODE = 'demo';
  process.env.WEATHER_CACHE_DIR = directory;
  try {
    const { GET } = await import('../app/api/weather/route.ts');
    const { createSharedStore } = await import('../lib/shared-store.ts');
    const { readObject } = await import('../../qa/lib/json.ts');
    const url = 'http://localhost/api/weather?lat=30.5728&lon=104.0668&fresh=1';
    const first = await readObject(await GET({ url }));
    const at = Date.now() - 16 * 60_000;
    await createSharedStore(directory).write('forecast-v3:demo:30.5728,104.0668', {
      at,
      value: { ...first, version: 'aged', fetchedAt: new Date(at).toISOString() },
    });
    const refreshed = await readObject(await GET({ url }));
    assert.equal(refreshed.stale, false);
    assert.notEqual(refreshed.version, 'aged');
    const reused = await readObject(await GET({ url }));
    assert.equal(reused.version, refreshed.version);
    assert.equal(reused.fetchedAt, refreshed.fetchedAt);
  } finally {
    if (oldMode === undefined) delete process.env.WEATHER_MODE;
    else process.env.WEATHER_MODE = oldMode;
    if (oldDirectory === undefined) delete process.env.WEATHER_CACHE_DIR;
    else process.env.WEATHER_CACHE_DIR = oldDirectory;
    await rm(directory, { recursive: true, force: true });
  }
});
