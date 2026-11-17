import type { LocalPageProps } from '../../lib/page-types.ts';
import { defaultCity, localPlace, isLocale } from '../../lib/catalog.ts';
import { notFound } from 'next/navigation';
import ServerScreen from '../../components/ServerScreen.tsx';
import { homeMeta, pageSchema } from '../../lib/seo.ts';
import StructuredData from '../../components/StructuredData.tsx';
import HomeIntro from '../../components/HomeIntro.tsx';
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: LocalPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return homeMeta(locale);
}
export default async function Home({ params }: LocalPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <>
      <StructuredData value={pageSchema(locale)} />
      <ServerScreen
        home
        locale={locale}
        place={localPlace(defaultCity, locale)}
        homeContent={<HomeIntro locale={locale} />}
      />
    </>
  );
}
