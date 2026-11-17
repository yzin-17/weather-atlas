export function siteOrigin(env: Record<string, string | undefined> = process.env) {
  const raw = env.SITE_URL?.trim() || env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) {
    if (env.NODE_ENV === 'production') throw new Error('生产环境必须配置 SITE_URL 为站点根地址');
    return 'http://localhost:3300';
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('SITE_URL 必须是有效的 HTTP／HTTPS 站点根地址');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    /[\u0000-\u0020\u007f]/.test(raw)
  ) {
    throw new Error('SITE_URL 仅支持 HTTP／HTTPS 站点根地址，不得包含凭据、子路径、查询或片段');
  }
  return url.origin;
}
