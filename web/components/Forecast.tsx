import type { Forecast, Locale } from '../lib/types.ts';
import type { labels } from '../lib/ui-text.ts';
type ForecastProps = { weather: Forecast; locale: Locale; t: ReturnType<typeof labels> };
import { timeLabel, dateLabel, localDay, temp, percent } from '../lib/format.ts';
import { condition } from '../lib/ui-text.ts';
import { outlook } from '../lib/summary.ts';
import { Icon, WeatherIcon } from './Symbols.tsx';
export function TemperatureTrend({ weather, t, locale }: ForecastProps) {
  const samples = weather.hours.filter((hour) => Number.isFinite(hour.temp));
  if (samples.length < 2) return null;
  const W = 460,
    H = 150,
    pad = 9,
    low = Math.min(...samples.map((h) => h.temp)),
    high = Math.max(...samples.map((h) => h.temp));
  const xy = (h: Forecast['hours'][number], i: number) => [
    pad + (i / (samples.length - 1)) * (W - 2 * pad),
    H - 20 - ((h.temp - low) / Math.max(1, high - low)) * (H - 49),
  ];
  const points = samples.map(xy);
  const line = points
    .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');
  const peak = points[samples.findIndex((h) => h.temp === high)],
    timeIndices = [
      0,
      Math.round((samples.length - 1) / 3),
      Math.round(((samples.length - 1) * 2) / 3),
      samples.length - 1,
    ];
  return (
    <div className="trend" role="img" aria-label={`${t.trend}, ${temp(low)} – ${temp(high)}`}>
      <div className="trend-title">
        <span>
          <i /> {t.trend}
        </span>
        <span>
          {temp(low)} – {temp(high)} C
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="plotFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--trend-fill-start)" stopOpacity=".23" />
            <stop offset="100%" stopColor="var(--trend-fill-end)" stopOpacity=".015" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((p) => (
          <path
            key={p}
            d={`M0 ${H * p}H${W}`}
            stroke="var(--trend-grid)"
            strokeOpacity=".4"
            strokeDasharray="3 5"
          />
        ))}
        <path d={`${line} L${W - pad} ${H} L${pad} ${H}Z`} fill="url(#plotFill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--trend-line)"
          strokeWidth="3"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={peak[0]}
          cy={peak[1]}
          r="4.5"
          fill="var(--trend-peak)"
          stroke="var(--trend-peak-stroke)"
          strokeWidth="1.5"
        />
        <circle cx={points[0][0]} cy={points[0][1]} r="3.5" fill="var(--trend-origin)" />
      </svg>
      <div className="trend-times">
        {timeIndices.map((i, k) => (
          <span key={k}>{timeLabel(samples[i].time, locale, weather.timezone)}</span>
        ))}
      </div>
    </div>
  );
}
export function Current({ weather, locale, t }: ForecastProps) {
  const { current, days, timezone, hours } = weather;
  const today = days.find((d) => d.date === localDay(current.time, timezone)) || days[0];
  return (
    <section className="current-panel">
      <div className="headline-data">
        <div className="panel-eyebrow">
          <span className="live-dot" />
          {t.current}
          <span className="eyebrow-line" />
        </div>
        <div className="temperature">
          <span>{Number.isFinite(current.temp) ? Math.round(current.temp) : '—'}</span>
          <span className="degree">°</span>
          <small>C</small>
        </div>
        <div className="condition">
          <WeatherIcon code={current.code} size={30} />
          {condition(current.code, locale)}
        </div>
        <div className="current-stats">
          <span>
            {t.high} <strong>{temp(today?.max)}</strong>
          </span>
          <span>
            {t.low} <strong>{temp(today?.min)}</strong>
          </span>
          <span>
            {t.rain} <strong>{percent(hours[0]?.rain)}</strong>
          </span>
        </div>
      </div>
      <TemperatureTrend weather={weather} t={t} locale={locale} />
    </section>
  );
}
export function Hours({ weather, locale, t }: ForecastProps) {
  return (
    <section className="forecast-section" id="hourly">
      <div className="section-heading">
        <div>
          <h2>{t.hourly}</h2>
          <span className="meta">{t.next24}</span>
        </div>
      </div>
      <div className="hours" role="list" tabIndex={0} aria-label={t.hourly}>
        {weather.hours.map((hour, i) => (
          <div className="hour" id={`hour-${hour.time}`} role="listitem" key={hour.time}>
            <time dateTime={new Date(hour.time * 1000).toISOString()}>
              {i === 0 ? t.now : timeLabel(hour.time, locale, weather.timezone)}
              {i > 0 &&
                localDay(hour.time, weather.timezone) !==
                  localDay(weather.hours[i - 1].time, weather.timezone) && (
                  <span className="hour-date">
                    {dateLabel(localDay(hour.time, weather.timezone), locale, {
                      month: 'numeric',
                      day: 'numeric',
                    })}
                  </span>
                )}
            </time>
            <WeatherIcon code={hour.code} size={35} />
            <b>{temp(hour.temp)}</b>
            <span className="rain">
              <Icon name="drop" size={12} />
              {percent(hour.rain)}
            </span>
          </div>
        ))}
      </div>
      <p className="hour-outlook">{outlook(weather, locale)}</p>
    </section>
  );
}
export function Week({ weather, locale, t }: ForecastProps) {
  const { days, timezone, current } = weather;
  const vals = days.flatMap((d) => [d.min, d.max]).filter(Number.isFinite),
    lo = Math.min(...vals),
    hi = Math.max(...vals);
  const today = localDay(current.time, timezone);
  return (
    <section className="forecast-section">
      <div className="section-heading">
        <h2>{t.week}</h2>
        <span className="meta">°C</span>
      </div>
      <div className="week">
        {days.map((d) => {
          const span = Math.max(1, hi - lo),
            left = ((d.min - lo) / span) * 100,
            width = ((d.max - d.min) / span) * 100;
          return (
            <div className="day" id={`day-${d.date}`} key={d.date}>
              <span className="day-name">
                {d.date === today ? t.today : dateLabel(d.date, locale, { weekday: 'short' })}
                <small>{dateLabel(d.date, locale, { month: 'numeric', day: 'numeric' })}</small>
              </span>
              <WeatherIcon code={d.code} size={27} />
              <span className="day-condition">{condition(d.code, locale)}</span>
              <span className="temp-min">{temp(d.min)}</span>
              <div className="temp-track" aria-hidden="true">
                {Number.isFinite(d.min) && Number.isFinite(d.max) && (
                  <i style={{ left: `${left}%`, width: `${Math.max(1, width)}%` }} />
                )}
              </div>
              <strong>{temp(d.max)}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}
