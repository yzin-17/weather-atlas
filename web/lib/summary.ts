import type { Forecast, Locale, HourWeather } from './types.ts';
import { timeLabel } from './format.ts';

export function outlook(weather: Forecast, locale: Locale) {
  const withRain = weather.hours.filter(
    (hour): hour is HourWeather & { rain: number } =>
      typeof hour.rain === 'number' && Number.isFinite(hour.rain),
  );
  if (!withRain.length) return '';
  const peak = withRain.reduce((best, hour) => (hour.rain > best.rain ? hour : best));
  const value = `${Math.round(peak.rain)}%`,
    time = timeLabel(peak.time, locale, weather.timezone);
  const equal = withRain.every((h) => h.rain === peak.rain);
  const copy = equal
    ? {
        en: `The available hourly forecast shows a ${value} chance of precipitation throughout.`,
        'zh-Hans': `已提供预报的各时段，降水概率均为 ${value}。`,
        'zh-Hant': `各個有預報的時段，降雨機率皆為 ${value}。`,
        ko: `강수 확률이 제공된 모든 시간대에서 ${value}로 예보됩니다.`,
      }
    : {
        en: `In the next 24 hours, the chance of precipitation peaks at ${value} at ${time} local time.`,
        'zh-Hans': `未来 24 小时，降水概率最高为 ${value}，出现在当地时间 ${time}。`,
        'zh-Hant': `未來 24 小時的降雨機率以當地時間 ${time} 最高，達 ${value}。`,
        ko: `향후 24시간 중 현지 시각 ${time}에 강수 확률이 ${value}로 가장 높습니다.`,
      };
  return copy[locale];
}
