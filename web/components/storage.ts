import { isRecord, isFiniteNumber, parseJson } from '../lib/validation.ts';
export function readLocal(key: string, fallback: unknown = null): unknown {
  try {
    const value = localStorage.getItem(`wa.${key}`);
    return value === null ? fallback : parseJson(value);
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(`wa.${key}`, JSON.stringify(value));
  } catch {
    /* Storage is optional in private browsing. */
  }
}
export function setHourPosition(value: { identity: string; x: number }) {
  try {
    sessionStorage.setItem('wa.hourRestore', JSON.stringify(value));
  } catch {}
}
export function takeHourPosition() {
  try {
    const value = sessionStorage.getItem('wa.hourRestore');
    sessionStorage.removeItem('wa.hourRestore');
    const position = value ? parseJson(value) : null;
    return isRecord(position) &&
      typeof position.identity === 'string' &&
      isFiniteNumber(position.x) &&
      position.x >= 0
      ? { identity: position.identity, x: position.x }
      : null;
  } catch {
    return null;
  }
}
