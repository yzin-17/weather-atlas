import type { Locale } from '../lib/types.ts';
import PreparedLink from './PreparedLink.tsx';
import { defaultCities, localPlace, placeURL } from '../lib/catalog.ts';
import { labels } from '../lib/ui-text.ts';

export default function HomeIntro({ locale }: { locale: Locale }) {
  const t = labels(locale);
  return (
    <section className="home-intro" aria-labelledby="home-title">
      <h1 id="home-title">{t.homeTitle}</h1>
      <p>{t.homeDescription}</p>
      <nav aria-label={t.homeCities}>
        <ul>
          {defaultCities.map((city) => {
            const place = localPlace(city, locale);
            return (
              <li key={city.id}>
                <PreparedLink href={placeURL(locale, place)}>{place.name}</PreparedLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </section>
  );
}
