import { jsonObject, recordsAt, numberAt, arrayAt } from './lib/json.ts';
import { requireValue } from '../web/lib/validation.ts';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const work = process.env.VERIFICATION_WORK;
assert(work);
for (const platform of ['android', 'ios'] as const) {
  const log: string = await readFile(`${work}/${platform}-resilience.log`, 'utf8');
  assert(log.includes('All tests passed!'));
  const match = log.match(/NATIVE_RESILIENCE (\{[^\n]+\})/);
  assert(match, '缺少原生 HTTP 场景投影');
  const data = jsonObject(match[1]);
  const results = recordsAt(data, '结果');
  assert.equal(results.length, 7);
  const timeout = results.find((r) => r.场景 === '真实 HTTP 客户端超时');
  assert(timeout);
  const ms = numberAt(timeout, '毫秒');
  assert(ms >= 21000 && ms < 30000);
  assert.equal(requireValue(results.find((r) => r.场景 === '恢复后四语切换')).新增天气请求, 0);
  assert.equal(requireValue(results.at(-1)).city, '1668341');
  assert.equal(requireValue(results.at(-1)).timezone, 'Asia/Taipei');
  await writeFile(
    new URL(`./evidence/${platform}-resilience.json`, import.meta.url),
    JSON.stringify({ at: new Date().toISOString(), platform, ...data }, null, 2),
  );
  console.log(
    JSON.stringify({
      platform,
      scenarios: results.length,
      timeoutMs: timeout.毫秒,
      requests: arrayAt(data, '请求').length,
    }),
  );
}
