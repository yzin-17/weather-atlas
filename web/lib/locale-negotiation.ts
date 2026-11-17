import { browserLocale, locales } from './catalog.ts';

export function negotiateLocale(header = '') {
  const ranges = String(header)
    .slice(0, 8192)
    .split(',')
    .slice(0, 64)
    .flatMap((part, order) => {
      const [rawTag, ...parameters] = part.trim().toLowerCase().split(';');
      const tag = rawTag.trim();
      if (!/^(?:\*|[a-z]{1,8}(?:-[a-z0-9]{1,8})*)$/.test(tag)) return [];
      const q =
        parameters
          .map((s) => s.trim())
          .find((s) => s.startsWith('q='))
          ?.slice(2) ?? '1';
      if (!/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(q)) return [];
      const locale = /^(en|ko|zh)(?:-|$)/.test(tag) ? browserLocale(tag) : null;
      return [{ tag, locale, q: Number(q), order }];
    });
  const candidates = ['en', ...locales.filter((l) => l !== 'en')].map((locale, fallback) => {
    const matches = ranges.map((range) => ({
      ...range,
      specificity:
        range.tag === '*'
          ? 0
          : range.tag === 'zh' && locale.startsWith('zh-')
            ? 1
            : range.locale === locale
              ? range.tag.split('-').length
              : -1,
    }));
    const range = matches
      .filter((r) => r.specificity >= 0)
      .sort((a, b) => b.specificity - a.specificity || a.order - b.order)[0];
    return { locale, fallback, q: range?.q || 0, order: range?.order ?? Infinity };
  });
  return (
    candidates
      .filter((c) => c.q > 0)
      .sort((a, b) => b.q - a.q || a.order - b.order || a.fallback - b.fallback)[0]?.locale || 'en'
  );
}
