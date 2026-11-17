import { jsonObject, recordsAt } from './lib/json.ts';
import { requireValue } from '../web/lib/validation.ts';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const work = process.env.VERIFICATION_WORK;
assert(work);
for (const platform of ['android', 'ios'] as const) {
  const log: string = await readFile(`${work}/reverse-${platform}-integration.log`, 'utf8');
  assert(log.includes('All tests passed!'));
  const match = log.match(/NATIVE_REVERSE (\{[^\n]+\})/);
  assert(match);
  const data = jsonObject(requireValue(match[1]));
  const results = recordsAt(data, '结果');
  assert.equal(results.length, 6);
  assert.equal(results[0].name, '台北');
  assert.equal(results[0].lat, 25.0478);
  assert.equal(results[0].lon, 121.5319);
  assert.equal(results[1].新增天气请求, 0);
  assert.equal(requireValue(results.at(-1)).timezone, 'Asia/Tokyo');
  await writeFile(
    new URL(`./evidence/reverse-${platform}.json`, import.meta.url),
    JSON.stringify({ at: new Date().toISOString(), platform, ...data }, null, 2),
  );
  console.log(
    JSON.stringify({
      platform,
      scenarios: results.length,
      languageWeatherDelta: 0,
      point: results[0],
    }),
  );
}
