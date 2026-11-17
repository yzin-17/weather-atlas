const formats = new Map<string, Intl.DateTimeFormat>();
function formatter(locale: string, zone: string, options: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify([locale, zone, options]);
  const cached = formats.get(key);
  if (cached) return cached;
  const value = new Intl.DateTimeFormat(locale, { timeZone: zone, ...options });
  formats.set(key, value);
  return value;
}
export function timeLabel(epoch: number, locale: string, zone: string) {
  return formatter(locale, zone, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(epoch * 1000);
}
export function hourLabel(epoch: number, locale: string, zone: string) {
  return formatter(locale, zone, { hour: 'numeric' }).format(epoch * 1000);
}
export function localDay(epoch: number, zone: string) {
  return formatter('en-CA', zone, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    epoch * 1000,
  );
}
export function dateLabel(date: string, locale: string, options: Intl.DateTimeFormatOptions) {
  return formatter(locale, 'UTC', options).format(new Date(date + 'T12:00:00Z'));
}
export function temp(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}°` : '—';
}
export function percent(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}%` : '—';
}
