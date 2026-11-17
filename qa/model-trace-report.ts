import { traceEvent, modelEvent } from './lib/trace.ts';
import { jsonObject, arrayAt } from './lib/json.ts';
import { errorInfo } from '../web/lib/errors.ts';
import { readFile, writeFile } from 'node:fs/promises';
const filename = process.env.MODEL_TRACE_LOG;
if (!filename) throw Error('必须指定 MODEL_TRACE_LOG');
const events = (
  await Promise.all(
    [filename, process.env.MODEL_EXTRA_TRACE_LOG]
      .filter((f): f is string => !!f)
      .map((f) => readFile(f, 'utf8')),
  )
)
  .join('\n')
  .split('\n')
  .flatMap((line) => {
    try {
      const r = traceEvent(line);
      return r ? [r] : [];
    } catch {
      return [];
    }
  });
try {
  events.push(
    ...arrayAt(
      jsonObject(
        await readFile(new URL('./evidence/model-shared-limit.json', import.meta.url), 'utf8'),
      ),
      'events',
    ).filter(modelEvent),
  );
} catch (e) {
  if (errorInfo(e).code !== 'ENOENT') throw e;
}
events.sort((a, b) => a.at - b.at);
const results = events.filter((r) => r.event === 'model-result'),
  times = results.flatMap((r) => (r.ms === undefined ? [] : [r.ms])).sort((a, b) => a - b);
const report: {
  记录时间: string;
  说明: '实际模型 HTTP 调用；包含修复前失败、复测和原生验收。HTTP 200 仍可能被服务端计划校验拒绝，应用结果见对应专项记录。此投影不保存凭据或问答正文。';
  调用数: number;
  返回数: number;
  模型: unknown[];
  开始: unknown;
  结束: unknown;
  耗时中位数: unknown;
  事件: unknown[];
} = {
  记录时间: new Date().toISOString(),
  说明: '实际模型 HTTP 调用；包含修复前失败、复测和原生验收。HTTP 200 仍可能被服务端计划校验拒绝，应用结果见对应专项记录。此投影不保存凭据或问答正文。',
  调用数: events.filter((r) => r.event === 'model-call').length,
  返回数: results.length,
  模型: [...new Set(events.map((r) => r.model))],
  开始: events[0]?.at,
  结束: events.at(-1)?.at,
  耗时中位数: times.length ? times[Math.floor(times.length / 2)] : null,
  事件: events,
};
await writeFile(
  new URL('./evidence/model-calls.json', import.meta.url),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ ...report, 事件: undefined }));
