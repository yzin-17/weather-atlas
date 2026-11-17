import { ImageResponse } from 'next/og';
import { Mark } from '../../components/Symbols.tsx';

// 固定品牌图在构建时生成；只用随 Next 提供的拉丁字体，不请求天气或外部字体。
export const dynamic = 'force-static';
export function GET() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#f8f8f2',
        color: '#28523d',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 88,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <Mark size={84} />
        <div style={{ display: 'flex', fontSize: 76, fontWeight: 600, letterSpacing: -3 }}>
          Weather Atlas
        </div>
      </div>
      <div style={{ display: 'flex', marginTop: 46, fontSize: 38 }}>Weather around the world.</div>
      <div style={{ display: 'flex', marginTop: 24, fontSize: 30, color: '#647267' }}>
        24 hourly forecasts · 7 days · 4 languages
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
    },
  );
}
