import { origin } from '../lib/seo.ts';
export const dynamic = 'force-dynamic';
export default function robots() {
  // demo 也允许读取页面的 noindex；禁止抓取会阻止爬虫看到移除索引的规则。
  if (process.env.WEATHER_MODE === 'demo')
    return { rules: { userAgent: '*', allow: '/', disallow: '/api/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: `${origin()}/sitemap.xml`,
  };
}
