import type { ReactNode } from 'react';
import type { LocalPageProps } from '../../lib/page-types.ts';
import { notFound } from 'next/navigation';
import { locales, isLocale } from '../../lib/catalog.ts';
import '../globals.css';
import WebVitals from '../../components/WebVitals.tsx';
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-content',
};
export default async function Layout({
  children,
  params,
}: LocalPageProps & { children: ReactNode }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale}>
      <body>
        {children}
        <WebVitals />
      </body>
    </html>
  );
}
