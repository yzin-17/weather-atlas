import { validMetricRows } from '../web/lib/rum.ts';
import type { MetricRow } from '../web/lib/rum.ts';
import { createSharedStore } from '../web/lib/shared-store.ts';
import { summarizeMetrics } from '../web/lib/rum.ts';
const store = createSharedStore(),
  rows: MetricRow[] = [];
const days = Number(process.argv[2] || process.env.RUM_DAYS || 7);
if (!Number.isInteger(days) || days < 1 || days > 90) throw Error('天数必须为 1–90');
for (let i = 0; i < days; i++)
  rows.push(
    ...((await store.read(
      'rum:' + new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
      validMetricRows,
    )) || []),
  );
console.log(
  JSON.stringify(
    {
      说明: '按服务端数据集分组；local-validation 为受控访问，不能作为真实用户 p75。每种指标按 id 去重。',
      样本数: rows.length,
      汇总: summarizeMetrics(rows),
    },
    null,
    2,
  ),
);
