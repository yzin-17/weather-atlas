/** 将可捕获的任意异常转换为可安全读取的诊断信息。 */
import { isRecord } from './validation.ts';
export function errorInfo(value: unknown): { name: string; message: string; code?: string } {
  if (value instanceof Error)
    return {
      name: value.name,
      message: value.message,
      code: 'code' in value && typeof value.code === 'string' ? value.code : undefined,
    };
  if (isRecord(value)) {
    const error = value;
    return {
      name: String(error.name || 'Error'),
      message: String(error.message || 'Unknown error'),
      code: typeof error.code === 'string' ? error.code : undefined,
    };
  }
  return { name: 'Error', message: String(value) };
}
