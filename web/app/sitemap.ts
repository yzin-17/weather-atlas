import { catalog, locales } from '../lib/catalog.ts';
import { origin, homeMeta } from '../lib/seo.ts';
export const dynamic = 'force-dynamic';
export default function sitemap() {
  if (process.env.WEATHER_MODE === 'demo') return [];
  const languages = homeMeta('en').alternates.languages;
  const homes = locales.map((l) => ({ url: languages[l], alternates: { languages } }));
  return [
    ...homes,
    ...catalog.flatMap((c) => {
      const languages = Object.fromEntries(
        locales.map((l) => [l, `${origin()}/${l}/weather/${c.slug}`]),
      );
      return locales.map((l) => ({
        url: languages[l],
        alternates: { languages: { ...languages, 'x-default': languages.en } },
      }));
    }),
  ];
}
