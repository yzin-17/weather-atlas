export const PREFETCH_TTL = 60_000;
export function canPrepare(
  {
    saveData,
    effectiveType,
    online = true,
    visible = true,
  }: { saveData?: boolean; effectiveType?: string; online?: boolean; visible?: boolean } = {},
  intent = false,
) {
  return (
    online &&
    visible &&
    !saveData &&
    !['slow-2g', '2g'].includes(effectiveType || '') &&
    (intent || effectiveType !== '3g')
  );
}
export function createPrefetchBudget() {
  const entries = new Map<string, number>(),
    groups = new Map<string, { time: number; count: number }>();
  return {
    claim(href: string, scope: string, intent = false, now = Date.now()) {
      for (const [key, time] of entries) if (now - time >= PREFETCH_TTL) entries.delete(key);
      for (const [key, value] of groups) if (now - value.time >= PREFETCH_TTL) groups.delete(key);
      if (entries.has(href)) return false;
      const group = groups.get(scope) || { time: now, count: 0 };
      if (!intent && group.count >= 2) return false;
      // 单个标签页的投机缓存也有界；明确点击仍可正常导航。
      if (entries.size >= 100) return false;
      entries.set(href, now);
      if (!intent) {
        group.count++;
        groups.set(scope, group);
      }
      return true;
    },
  };
}
