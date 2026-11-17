import type { Place, Locale } from '../lib/types.ts';
import type { ReactNode } from 'react';
import WeatherScreen from './WeatherScreen.tsx';
import { pageWeather } from '../lib/page-weather.ts';
import { trace } from '../lib/trace.ts';
import { forecastNamespace } from '../lib/weather.ts';
export default async function ServerScreen({
  locale,
  place,
  home,
  homeContent,
}: {
  locale: Locale;
  place: Place;
  home?: boolean;
  homeContent?: ReactNode;
}) {
  const started = performance.now();
  const initial = await pageWeather(place.lat, place.lon);
  trace('ssr-weather', {
    ms: Math.round((performance.now() - started) * 100) / 100,
    available: !!initial,
  });
  return (
    <WeatherScreen
      key={`${locale}/${place.lat}/${place.lon}`}
      locale={locale}
      place={place}
      initial={initial}
      cacheNamespace={forecastNamespace()}
      home={!!home}
      homeContent={homeContent}
    />
  );
}
