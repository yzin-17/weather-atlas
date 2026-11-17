import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseJson, isRecord, isArray } from '../lib/validation.ts';
import { validSnapshot } from '../lib/client-forecast.ts';

const document = parseJson(
  await readFile(new URL('../../contracts/forecast-cases.json', import.meta.url), 'utf8'),
);
assert(isRecord(document) && isArray(document.cases));
for (const entry of document.cases) {
  assert(isRecord(entry) && typeof entry.name === 'string' && typeof entry.valid === 'boolean');
  test(`共享预报契约：${entry.name}`, () => {
    const value: unknown = structuredClone(document.base);
    if (isArray(entry.path) && entry.path.length) {
      let target = value;
      for (const key of entry.path.slice(0, -1)) {
        if (typeof key === 'string' && isRecord(target)) target = target[key];
        else if (typeof key === 'number' && isArray(target)) target = target[key];
        else throw Error('Invalid contract patch');
      }
      const key = entry.path.at(-1);
      if (typeof key === 'string' && isRecord(target)) target[key] = entry.value;
      else if (typeof key === 'number' && isArray(target)) target[key] = entry.value;
      else throw Error('Invalid contract patch');
    }
    assert.equal(validSnapshot(value), entry.valid);
    if (validSnapshot(value)) {
      assert.equal(value.hours[1].rain, 0);
      assert.equal(value.days[0].min, 0);
    }
  });
}
