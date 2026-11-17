import type { AskResult, ComparisonContext, ComparisonRow, Forecast } from '../../web/lib/types.ts';
/** 比较专项在断言成功响应后使用的契约。 */
export type ComparisonAnswer = AskResult & {
  context: ComparisonContext;
  comparisons: ComparisonRow[];
  code?: string;
};
export interface ForecastRecord {
  at: number;
  value: Forecast;
}
