import { isRecord, isFiniteNumber as finite } from './validation.ts';
import { isLocale } from './catalog.ts';
export interface Metric {
  id: string;
  name: string;
  value: number;
  locale: string;
  pageType: string;
  device: string;
}
export interface MetricRow extends Metric {
  receivedAt: number;
  dataset: string;
}
export function validMetricRow(value: unknown): value is MetricRow {
  if (!isRecord(value) || !finite(value.receivedAt) || typeof value.dataset !== 'string')
    return false;
  try {
    validateMetric(value);
    return true;
  } catch {
    return false;
  }
}
export function validateMetric(value: unknown): Metric {
  const raw = isRecord(value) ? value : null;
  if (
    !raw ||
    typeof raw.name !== 'string' ||
    !['LCP', 'INP', 'CLS'].includes(raw.name) ||
    typeof raw.value !== 'number' ||
    !Number.isFinite(raw.value) ||
    raw.value < 0 ||
    raw.value > (raw.name === 'CLS' ? 100 : 3600000) ||
    typeof raw.id !== 'string' ||
    !/^[\w.-]{1,100}$/.test(raw.id) ||
    !isLocale(raw.locale) ||
    typeof raw.pageType !== 'string' ||
    !['city', 'explore', 'home'].includes(raw.pageType) ||
    typeof raw.device !== 'string' ||
    !['mobile', 'tablet', 'desktop'].includes(raw.device)
  )
    throw new Error('Invalid metric');
  // 严格投影：不保存 URL、定位、IP、User-Agent 或问答正文。
  return {
    id: raw.id,
    name: raw.name,
    value: raw.value,
    locale: raw.locale,
    pageType: raw.pageType,
    device: raw.device,
  };
}
export function validMetricRows(value: unknown): value is MetricRow[] {
  if (!Array.isArray(value)) return false;
  return value.every((row: unknown) => {
    if (!isRecord(row) || !finite(row.receivedAt) || typeof row.dataset !== 'string') return false;
    try {
      validateMetric(row);
      return true;
    } catch {
      return false;
    }
  });
}
export function summarizeMetrics(rows: MetricRow[]) {
  const groups = new Map<string, MetricRow[]>();
  for (const row of rows) {
    const key = [row.dataset, row.name, row.pageType, row.locale, row.device].join('/');
    const values = groups.get(key) || [];
    values.push(row);
    groups.set(key, values);
  }
  return [...groups].map(([group, values]) => {
    const sorted = values.map((r) => r.value).sort((a, b) => a - b);
    return {
      group,
      count: sorted.length,
      p75: sorted[Math.ceil(sorted.length * 0.75) - 1],
      from: new Date(Math.min(...values.map((r) => r.receivedAt))).toISOString(),
      to: new Date(Math.max(...values.map((r) => r.receivedAt))).toISOString(),
    };
  });
}
