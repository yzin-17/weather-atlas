import { negotiateLocale } from '../../lib/locale-negotiation.ts';

export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  const locale = negotiateLocale(request.headers.get('accept-language') || '');
  // Route Handler 保留协商响应头；页面渲染链会覆盖配置中的 Vary。
  return new Response(null, {
    status: 307,
    headers: {
      Location: `/${locale}`,
      Vary: 'Accept-Language',
      'Cache-Control': 'private, no-store',
    },
  });
}
