import type { LocalPageProps } from '../../../lib/page-types.ts';
import type { Place } from '../../../lib/types.ts';
import { notFound, permanentRedirect } from 'next/navigation';
import { coordinates } from '../../../lib/weather.ts';
import { isLocale, publicCityForPlace } from '../../../lib/catalog.ts';
import { labels } from '../../../lib/ui-text.ts';
import ServerScreen from '../../../components/ServerScreen.tsx';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Weather Atlas', robots: { index: false, follow: false } };
export default async function Explore({
  params,
  searchParams,
}: LocalPageProps & { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params,
    q = await searchParams;
  if (!isLocale(locale)) notFound();
  let coords: { lat: number; lon: number };
  try {
    coords = coordinates(q.lat, q.lon);
  } catch {
    notFound();
  }
  const t = labels(locale),
    kind = q.kind === 'gps' ? 'gps' : q.kind === 'pin' ? 'pin' : 'place';
  const safe = (v: unknown) => (typeof v === 'string' ? v.slice(0, 128) : '');
  const place: Place = {
    ...coords,
    kind,
    id: safe(q.id) || `point-${coords.lat},${coords.lon}`,
    name: kind === 'gps' ? t.location : kind === 'pin' ? t.map : safe(q.name) || t.map,
    country: safe(q.country),
    region: safe(q.region),
  };
  const city = publicCityForPlace(place);
  if (city) permanentRedirect(`/${locale}/weather/${city.slug}`);
  return <ServerScreen locale={locale} place={place} />;
}
