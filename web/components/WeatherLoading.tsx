import type { Locale, Place } from '../lib/types.ts';
import { labels } from '../lib/ui-text.ts';
import { isCoordinatePlace } from '../lib/catalog.ts';

export default function WeatherLoading({ place, locale }: { place: Place; locale: Locale }) {
  const t = labels(locale);
  const point = isCoordinatePlace(place);
  return (
    <section className="weather-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="location-heading">
        <div>
          <p className="place-country">
            {point
              ? `${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}`
              : place.country || t.selectedLocation}
          </p>
          <h1>{place.label?.name || (point ? t.selectedLocation : place.name)}</h1>
        </div>
      </div>
      <p className="weather-loading-status">
        <i className="weather-loading-spinner" aria-hidden="true" />
        {t.loadingWeather}
      </p>
      <div className="weather-loading-current" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="weather-loading-hours" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <i key={index} />
        ))}
      </div>
      <div className="weather-loading-week" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </section>
  );
}
