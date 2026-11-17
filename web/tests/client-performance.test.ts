import { requireValue } from '../lib/validation.ts';
import type { Forecast } from '../lib/types.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { canPrepare, createPrefetchBudget } from '../lib/prefetch-policy.ts';
import {
  cachedSummary,
  preferredSnapshot,
  snapshotAge,
  FORECAST_FRESH_MS,
  FORECAST_STALE_MS,
  validSnapshot,
} from '../lib/client-forecast.ts';
const now = Date.now(),
  place = { lat: 25, lon: 121 };
const snap = (age = 0, props: Partial<Forecast> = {}): Forecast => ({
  stale: false,
  version: 'v1',
  source: 'fixture',
  timezone: 'Asia/Taipei',
  fetchedAt: new Date(now - age).toISOString(),
  current: { temp: 0, code: 0, time: now / 1000 },
  hours: Array.from({ length: 24 }, (_, i) => ({
    time: now / 1000 + i * 3600,
    temp: 0,
    code: 0,
    rain: 0,
  })),
  days: Array.from({ length: 7 }, () => ({ date: '2026-11-17', min: 0, max: 0, code: 0 })),
  ...props,
});

test('本机快照类型守卫校验嵌套字段，保留零值与缺测降水', () => {
  const valid = snap(0, { hours: snap().hours.map((h) => ({ ...h, rain: null })) });
  assert(validSnapshot(valid));
  for (const value of [
    null,
    42,
    { ...valid, source: 'unknown' },
    { ...valid, stale: 'false' },
    { ...valid, current: { ...valid.current, temp: '0' } },
    { ...valid, hours: valid.hours.map((h) => ({ ...h, rain: undefined })) },
    { ...valid, days: valid.days.map((d) => ({ ...d, min: '0' })) },
  ])
    assert.equal(validSnapshot(value), false);
});

test('投机预取遵循省流量、页面状态、慢网；明确意图允许 3g', () => {
  assert.equal(canPrepare({}), true);
  for (const env of [
    { saveData: true },
    { online: false },
    { visible: false },
    { effectiveType: '2g' },
    { effectiveType: 'slow-2g' },
  ]) {
    assert.equal(canPrepare(env), false);
    assert.equal(canPrepare(env, true), false);
  }
  assert.equal(canPrepare({ effectiveType: '3g' }), false);
  assert.equal(canPrepare({ effectiveType: '3g' }, true), true);
});
test('100 收藏最多自动准备两项；意图、跨语言、去重和过期分别计量', () => {
  const budget = createPrefetchBudget();
  assert.equal(
    Array.from({ length: 100 }, (_, i) =>
      budget.claim('/city/' + i, 'seoul:en', false, now),
    ).filter(Boolean).length,
    2,
  );
  assert.equal(budget.claim('/city/2', 'seoul:en', true, now), true);
  assert.equal(budget.claim('/city/2', 'seoul:en', true, now), false);
  assert.equal(budget.claim('/ko/city/2', 'seoul:ko', false, now), true);
  assert.equal(budget.claim('/city/0', 'seoul:en', false, now + 60_000), true);
});
test('城市摘要只复用同源新鲜完整快照，零值与原抓取时间不丢失', () => {
  assert.deepEqual(cachedSummary(place, snap(), 'fixture', now), {
    ...place,
    temp: 0,
    code: 0,
    time: now,
  });
  for (const s of [
    snap(FORECAST_FRESH_MS),
    snap(0, { stale: true }),
    snap(0, { source: 'demo' }),
    snap(0, { hours: [] }),
    snap(-1),
    snap(0, { fetchedAt: 'bad' }),
  ])
    assert.equal(cachedSummary(place, s, 'fixture', now), null);
});
test('旧预取不覆盖较新同源快照；跨数据源、过期与未来时间被隔离', () => {
  const initial = snap(120_000),
    newer = snap(60_000, { version: 'v2' });
  assert.equal(requireValue(preferredSnapshot(initial, newer, now)).version, 'v2');
  assert.equal(
    requireValue(preferredSnapshot(initial, snap(0, { source: 'demo' }), now)).version,
    'v1',
  );
  assert.equal(preferredSnapshot(null, snap(FORECAST_STALE_MS), now), null);
  assert.equal(preferredSnapshot(null, snap(-1), now), null);
  assert.equal(snapshotAge(snap(0, { fetchedAt: 'bad' }), now), Infinity);
  assert.equal(requireValue(preferredSnapshot(snap(FORECAST_FRESH_MS), null, now)).stale, true);
  assert.equal(requireValue(preferredSnapshot(null, newer, now)).stale, true);
});
