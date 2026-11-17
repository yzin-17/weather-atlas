import type { SVGProps } from 'react';
import { typeFor } from '../lib/ui-text.ts';
const paths = {
  link: (
    <>
      <path d="m10 13 4-4M8 15l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" />
    </>
  ),
  search: (
    <>
      <circle cx="10" cy="10" r="6.5" />
      <path d="m15 15 5 5" />
    </>
  ),
  pin: (
    <>
      <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" />
      <circle cx="12" cy="10" r="2.2" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c-5 4-5 14 0 18m0-18c5 4 5 14 0 18" />
    </>
  ),
  locate: (
    <>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 1v4m0 14v4M1 12h4m14 0h4" />
    </>
  ),
  map: (
    <>
      <path d="m3 5 6-2 6 3 6-2v15l-6 2-6-3-6 2V5Zm6-2v15m6-12v15" />
    </>
  ),
  arrow: <path d="m6 18 12-12M7 6h11v11" />,
  east: <path d="M3 12h17m-6-6 6 6-6 6" />,
  west: <path d="M21 12H4m6-6-6 6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  close: <path d="m5 5 14 14M19 5 5 19" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1" />,
  plus: <path d="M12 4v16M4 12h16" />,
  check: <path d="m4 12 5 5L20 6" />,
  spark: (
    <>
      <path d="m10 2 2.3 6.2L19 11l-6.7 2.6L10 20l-2.5-6.4L1 11l6.5-2.8L10 2Z" />
      <path d="m19 3 1 2.5L22 6.5l-2 1-1 2.5-1-2.5-2-1 2-1L19 3Z" />
    </>
  ),
  bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z" />,
  chart: (
    <>
      <path d="M3 17v4h18M5 15l4-6 4 3 6-8" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  drop: <path d="M12 2S5 10 5 15a7 7 0 1 0 14 0c0-5-7-13-7-13Z" />,
  list: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </>
  ),
};
export function Icon({
  name,
  size = 18,
  ...props
}: SVGProps<SVGSVGElement> & { name: keyof typeof paths; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
export function Mark({ size = 35 } = {}) {
  return (
    <svg
      className="mark"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="38" height="38" rx="11" fill="currentColor" />
      <g stroke="#faf9f4" strokeWidth="1.7" strokeLinecap="round">
        <path d="M7 24h24M10 28h18M14 32h10M11 21a9 9 0 0 1 18 0M20 5v4m-11 2 3 3m18-3-3 3M6 19l4 1m24-1-4 1" />
      </g>
    </svg>
  );
}
export function WeatherIcon({ code, size = 32 }: { code: number; size?: number }) {
  const type = typeFor(code);
  const sunny = type === 'clear',
    mixed = type === 'partly';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="weather-icon"
    >
      {(sunny || mixed) && (
        <g
          transform={mixed ? 'translate(8 1) scale(.70)' : undefined}
          stroke="#a76b16"
          strokeWidth="1.7"
        >
          <circle cx="20" cy="20" r="8" fill="#efb742" />
          {Array.from({ length: 8 }, (_, i) => (
            <path key={i} d="M20 4v4" transform={`rotate(${i * 45} 20 20)`} />
          ))}
        </g>
      )}
      {!sunny && (
        <>
          <path
            d="M9 28h20a5.5 5.5 0 0 0 1-10.9 8.8 8.8 0 0 0-16.1-2.9 6.2 6.2 0 0 0-8.8 6A4.1 4.1 0 0 0 9 28Z"
            fill={mixed ? '#f9f7e9' : '#e5e9e4'}
            stroke="#53655b"
            strokeWidth="1.7"
          />
          {['rain', 'drizzle'].includes(type) && (
            <path d="m12 32-2 3m10-3-2 3m10-3-2 3" stroke="#438394" strokeWidth="2.1" />
          )}
          {type === 'snow' && (
            <g fill="#5496ad">
              <circle cx="12" cy="33" r="1.7" />
              <circle cx="20" cy="33" r="1.7" />
              <circle cx="28" cy="33" r="1.7" />
            </g>
          )}
          {type === 'thunder' && <path d="m20 26-4 7h4l-2 5 9-10h-6l3-2Z" fill="#ebb03c" />}
          {type === 'fog' && <path d="M7 32h25m-20 4h15" stroke="#869289" strokeWidth="1.7" />}
        </>
      )}
    </svg>
  );
}
