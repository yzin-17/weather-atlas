import type { NextConfig } from 'next';
import { hostname, networkInterfaces } from 'node:os';
import { siteOrigin } from './lib/site-config.ts';

// 构建／启动即发现公开地址配置错误，避免生成 localhost 或被截断的 canonical。
siteOrigin();

// Next.js 不接受单独的 *；域名与 IPv4 使用通配，本机名和 IPv6 显式加入。
const allowedDevOrigins = [
  ...new Set([
    '**.*',
    'localhost',
    '[::1]',
    hostname(),
    hostname().split('.')[0],
    ...Object.values(networkInterfaces())
      .flat()
      .filter((info): info is NonNullable<typeof info> => !!info)
      .flatMap(({ address, family }) =>
        family === 'IPv6' ? [address, `[${address}]`] : [address],
      ),
  ]),
];

const config: NextConfig = {
  allowedDevOrigins,
  reactStrictMode: true,
  poweredByHeader: false,
  // 天气可用性参与索引判断；等待 metadata，保证所有 UA 的 head 都完整且唯一。
  htmlLimitedBots: /.*/,
  devIndicators: false,
  // 完整预取默认保留五分钟；天气页缩短到一分钟，动态点击仍即时取数。
  experimental: { staleTimes: { dynamic: 0, static: 60 } },
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async headers() {
    return [
      { source: '/api/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
};
export default config;
