import { isLocale } from '../../../../../../../lib/catalog.ts';
import sharp from 'sharp';
import { locales } from '../../../../../../../lib/catalog.ts';
export const runtime = 'nodejs';
const labels = {
  'zh-Hans': ['首尔', '台北'],
  'zh-Hant': ['首爾', '臺北'],
  en: ['Seoul', 'Taipei'],
  ko: ['서울', '타이베이'],
};
const colors = { 'zh-Hans': '#d9ead3', 'zh-Hant': '#fff2cc', en: '#cfe2f3', ko: '#f4cccc' };
const cache = new Map<string, Buffer>();
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; z: string; x: string; y: string }> },
) {
  if (process.env.WEATHER_TEST_TILES !== '1') return new Response(null, { status: 404 });
  const { locale, z, x, y } = await params;
  if (
    !isLocale(locale) ||
    ![z, x, y].every((n) => /^\d{1,10}$/.test(n)) ||
    Number(z) > 19 ||
    Number(x) >= 2 ** Number(z) ||
    Number(y) >= 2 ** Number(z)
  )
    return new Response(null, { status: 400 });
  const key = [locale, z, x, y].join('/');
  let body = cache.get(key);
  if (!body) {
    const names = labels[locale];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${colors[locale]}"/><path d="M0 70H256M0 170H256M70 0V256M170 0V256" stroke="#a0b5b0" fill="none"/><g fill="#193c3c" font-family="sans-serif" font-size="18"><text x="18" y="42">${names[0]} · ${locale}</text><text x="90" y="135">${names[1]}</text><text x="12" y="210">GeoNames fallback</text><text x="12" y="236" font-size="12">TEST ${z}/${x}/${y}</text></g></svg>`;
    body = await sharp(Buffer.from(svg)).png().toBuffer();
    cache.set(key, body);
    if (cache.size > 256) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
  }
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, immutable',
      'X-Robots-Tag': 'noindex',
      'X-Map-Style': locale,
    },
  });
}
