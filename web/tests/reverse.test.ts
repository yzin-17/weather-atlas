import { requireValue } from '../lib/validation.ts';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createReverseGeocoder, photonLabel, localizeLabel } from '../lib/reverse.ts';
const response = (properties: {
  city: string;
  district?: string;
  country?: string;
  countrycode: string;
  street?: string;
  housenumber?: string;
}) =>
  new Response(JSON.stringify({ features: [{ properties, geometry: { coordinates: [0, 0] } }] }));
async function setup(t: test.TestContext, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'atlas-reverse-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, reverse: createReverseGeocoder({ directory, ...options }) };
}
test('reverse preserves query point, extracts city without address, caches native and English labels separately across four languages and instances', async (t) => {
  const calls: { searchParams: { get: (arg0: string) => unknown } }[] | URL[] = [];
  const fetcher = async (url: string | URL) => {
    calls.push(new URL(url));
    return response({
      city: 'Taipei',
      district: 'Zhongshan',
      country: 'Taiwan',
      countrycode: 'TW',
      street: 'private',
      housenumber: '26',
    });
  };
  const { directory, reverse } = await setup(t, { fetcher });
  const other = createReverseGeocoder({ directory, fetcher });
  const result = await Promise.all(
    ['zh-Hans', 'zh-Hant', 'en', 'ko'].map((l, i) =>
      (i % 2 ? other : reverse)(25.0478, 121.5319, l),
    ),
  );
  assert.deepEqual(
    result.map((r) => requireValue(r.place).name),
    ['台北', '臺北', 'Taipei', '타이베이'],
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(
    new Set(calls.map((url) => url.searchParams.get('lang'))),
    new Set(['en', 'default']),
  );
  assert.equal(calls[0].searchParams.get('lat'), '25.0478');
  assert.equal(calls[0].searchParams.get('lon'), '121.5319');
  assert(
    result.every(
      (r) =>
        requireValue(r.place).level === 'city' &&
        !('lat' in requireValue(r.place)) &&
        !('street' in requireValue(r.place)),
    ),
  );
});
test('reverse region and no-coverage fallbacks do not invent a city or use POI names', async (t) => {
  assert.equal(
    photonLabel({
      features: [{ properties: { name: 'A house', district: 'Region', country: 'Country' } }],
    }).name,
    'Region',
  );
  assert.equal(photonLabel({ features: [{ properties: { name: 'A house' } }] }), null);
  assert.equal(
    requireValue(
      localizeLabel(
        photonLabel({ features: [{ properties: { country: 'Japan', countrycode: 'JP' } }] }),
        'zh-Hans',
      ),
    ).name,
    '日本',
  );
  const { reverse } = await setup(t, { fetcher: async () => new Response('{"features":[]}') });
  assert.equal((await reverse(0, 0)).place, null);
});
test('Huizhou native name survives an earlier English cache and restart without moving the point', async (t) => {
  const calls: URL[] = [];
  const fetcher = async (url: URL) => {
    calls.push(url);
    return response({
      city: url.searchParams.get('lang') === 'en' ? 'Huizhou' : '惠州市',
      countrycode: 'CN',
    });
  };
  const { directory, reverse } = await setup(t, { fetcher });
  assert.equal((await reverse(23.11, 114.41, 'en')).place?.name, 'Huizhou');
  assert.equal((await reverse(23.11, 114.41, 'zh-Hans')).place?.name, '惠州市');
  const restarted = createReverseGeocoder({ directory, fetcher });
  assert.equal((await restarted(23.11, 114.41, 'zh-Hant')).place?.name, '惠州市');
  assert.equal((await restarted(23.11, 114.41, 'ko')).place?.name, '惠州市');
  assert.equal(calls.length, 2);
  assert(
    calls.every(
      (url) => url.searchParams.get('lat') === '23.11' && url.searchParams.get('lon') === '114.41',
    ),
  );
});
test('reverse invalid coordinates never call upstream and timeouts fail independently', async (t) => {
  let calls = 0;
  const { reverse } = await setup(t, {
    fetcher: async () => {
      calls++;
      throw new DOMException('timed out', 'TimeoutError');
    },
  });
  await assert.rejects(
    reverse('', 0),
    (e) => e instanceof Error && 'status' in e && e.status === 400,
  );
  await assert.rejects(
    reverse(91, 0),
    (e) => e instanceof Error && 'status' in e && e.status === 400,
  );
  assert.equal(calls, 0);
  assert.equal((await reverse(37, 127)).place, null);
  assert.equal((await reverse(37, 127)).place, null);
  assert.equal(calls, 1);
});
test('截图坐标在一公里无覆盖时扩大到十公里，仅采用行政区域并缓存', async (t) => {
  const calls: URL[] = [];
  const { reverse, directory } = await setup(t, {
    sleep: async () => {},
    fetcher: async (url: URL) => {
      calls.push(new URL(url));
      return url.searchParams.get('radius') === '1'
        ? new Response('{"features":[]}')
        : response({ city: '佛门乡', district: '高坪区', countrycode: 'CN' });
    },
  });
  const result = await reverse(30.7513, 106.2048, 'zh-Hans');
  assert.equal(result.place?.name, '高坪区');
  assert.equal(result.place?.level, 'region');
  assert.equal(result.retryAfterMs, null);
  assert.deepEqual(
    calls.map((url) => url.searchParams.get('radius')),
    ['1', '10'],
  );
  assert(
    calls.every(
      (url) =>
        url.searchParams.get('lat') === '30.7513' && url.searchParams.get('lon') === '106.2048',
    ),
  );
  const restarted = createReverseGeocoder({
    directory,
    fetcher: async () => {
      throw Error('应命中共享缓存');
    },
  });
  assert.equal((await restarted(30.7513, 106.2048, 'zh-Hans')).place?.name, '高坪区');
});
test('临时超时仅退避五秒，恢复后同一点重新解析；真实无覆盖仍缓存五分钟', async (t) => {
  let clock = 10000,
    calls = 0;
  const { reverse } = await setup(t, {
    now: () => clock,
    sleep: async () => {},
    fetcher: async () => {
      if (++calls === 1) throw new DOMException('超时', 'TimeoutError');
      return response({ city: '惠州市', countrycode: 'CN' });
    },
  });
  assert.equal((await reverse(23.11, 114.41, 'zh-Hans')).retryAfterMs, 5000);
  clock += 4999;
  assert.equal((await reverse(23.11, 114.41, 'zh-Hans')).place, null);
  assert.equal(calls, 1);
  clock++;
  assert.equal((await reverse(23.11, 114.41, 'zh-Hans')).place?.name, '惠州市');
  assert.equal(calls, 2);
  let emptyCalls = 0;
  const empty = await setup(t, {
    now: () => clock,
    sleep: async () => {},
    fetcher: async () => {
      emptyCalls++;
      return new Response('{"features":[]}');
    },
  });
  assert.equal((await empty.reverse(0, 0)).retryAfterMs, null);
  clock += 6000;
  assert.equal((await empty.reverse(0, 0)).place, null);
  assert.equal(emptyCalls, 2);
});
test('扩大范围不会采用邻近村镇或 POI 作为城市，异常响应可恢复', async (t) => {
  let malformed = true;
  let clock = 10000;
  const { reverse } = await setup(t, {
    now: () => clock,
    sleep: async () => {},
    fetcher: async (url: URL) => {
      if (malformed) return new Response('{}');
      return url.searchParams.get('radius') === '1'
        ? new Response('{"features":[]}')
        : response({ city: '邻近村镇', countrycode: 'CN' });
    },
  });
  assert.equal((await reverse(30, 106)).retryAfterMs, 5000);
  clock += 5000;
  malformed = false;
  const result = await reverse(30, 106);
  assert.equal(result.place, null);
  assert.equal(result.retryAfterMs, null);
});
test('reverse global start spacing is shared across distinct coordinates and instances', async (t) => {
  const starts: number[] = [];
  let clock = 10000;
  const options = {
    now: () => clock,
    sleep: async (ms: number) => {
      clock += ms;
    },
    fetcher: async () => {
      starts.push(clock);
      return response({ city: 'Paris', countrycode: 'FR' });
    },
  };
  const { directory, reverse } = await setup(t, options),
    other = createReverseGeocoder({ directory, ...options });
  await Promise.all([reverse(48.85, 2.35), other(48.86, 2.36)]);
  assert.equal(starts.length, 2);
  assert(starts[1] - starts[0] >= 1000);
});
test('共享上游繁忙时提示稍后重试，不缓存为真实无覆盖', async (t) => {
  let release: (() => void) | undefined;
  let started: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  let calls = 0;
  const fetcher = async () => {
    calls++;
    if (calls === 1) {
      started?.();
      await gate;
    }
    return response({ city: 'Kyoto', countrycode: 'JP' });
  };
  const { reverse, directory } = await setup(t, { fetcher });
  const first = reverse(35, 135);
  try {
    await ready;
    const other = createReverseGeocoder({ directory, fetcher });
    const busy = await other(35.1, 135.1);
    assert.equal(busy.place, null);
    assert(busy.retryAfterMs !== null && busy.retryAfterMs >= 1000 && busy.retryAfterMs <= 5000);
    assert.equal(calls, 1);
    release?.();
    await first;
    assert.equal((await other(35.1, 135.1)).place?.name, 'Kyoto');
    assert.equal(calls, 2);
  } finally {
    release?.();
    await first;
  }
});
test('reverse retains older positive label during outage, backs off five minutes, and expires it after thirty days', async (t) => {
  let clock = 10000,
    calls = 0,
    offline = false;
  const { reverse } = await setup(t, {
    now: () => clock,
    sleep: async () => {},
    fetcher: async () => {
      calls++;
      if (offline) throw Error('offline');
      return response({ city: 'Kyoto', countrycode: 'JP' });
    },
  });
  assert.equal(requireValue((await reverse(35, 135)).place).name, 'Kyoto');
  offline = true;
  clock += 8 * 86400000;
  assert.equal(requireValue((await reverse(35, 135)).place).name, 'Kyoto');
  assert.equal(requireValue((await reverse(35, 135)).place).name, 'Kyoto');
  assert.equal(calls, 2);
  clock += 31 * 86400000;
  assert.equal((await reverse(35, 135)).place, null);
  assert.equal(calls, 3);
});
test('reverse aborts a real unresponsive HTTP upstream without failing weather metadata response', async (t) => {
  const server = http.createServer(() => {});
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  const { reverse } = await setup(t, {
    endpoint: `http://127.0.0.1:${address.port}/reverse`,
  });
  const started = performance.now();
  assert.equal((await reverse(1, 2)).place, null);
  assert(performance.now() - started >= 5900);
  assert(performance.now() - started < 8000);
});
test('reverse pruning caps its own namespace and preserves weather directory files', async (t) => {
  const { directory, reverse } = await setup(t, {
    fetcher: async () => response({ city: 'Kyoto', countrycode: 'JP' }),
  });
  const root = path.join(directory, 'reverse');
  await mkdir(root, { recursive: true });
  await writeFile(path.join(directory, 'weather-sentinel.json'), 'keep');
  for (let batch = 0; batch < 1030; batch += 50)
    await Promise.all(
      Array.from({ length: Math.min(50, 1030 - batch) }, (_, i) =>
        writeFile(path.join(root, `seed-${batch + i}.json`), '{}'),
      ),
    );
  await reverse(35, 135);
  for (
    let n = 0;
    n < 100 && (await readdir(root)).filter((f) => f.endsWith('.json')).length > 1024;
    n++
  )
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert((await readdir(root)).filter((f) => f.endsWith('.json')).length <= 1024);
  assert.equal(await readFile(path.join(directory, 'weather-sentinel.json'), 'utf8'), 'keep');
});
