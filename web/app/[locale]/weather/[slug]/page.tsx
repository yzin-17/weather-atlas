import type { LocalPageProps } from '../../../../lib/page-types.ts';
import { notFound } from 'next/navigation';
import { catalog, localPlace, locales, isLocale } from '../../../../lib/catalog.ts';
import { cityMeta, pageSchema } from '../../../../lib/seo.ts';
import ServerScreen from '../../../../components/ServerScreen.tsx';
import StructuredData from '../../../../components/StructuredData.tsx';
import { pageWeather } from '../../../../lib/page-weather.ts';
export const dynamic = 'force-dynamic';
function resolve(locale: string, slug: string) {
  const city = catalog.find((c) => c.slug === slug);
  if (!city || !isLocale(locale)) notFound();
  return city;
}
export async function generateMetadata({ params }: LocalPageProps<{ slug: string }>) {
  const { locale, slug } = await params;
  const city = resolve(locale, slug);
  const weather = await pageWeather(city.lat, city.lon);
  if (!isLocale(locale)) notFound();
  return cityMeta(city, locale, { forecastAvailable: !!weather });
}
export default async function City({ params }: LocalPageProps<{ slug: string }>) {
  const { locale, slug } = await params,
    city = resolve(locale, slug);
  if (!isLocale(locale)) notFound();
  return (
    <>
      <StructuredData value={pageSchema(locale, city)} />
      <ServerScreen locale={locale} place={localPlace(city, locale)} />
    </>
  );
}
