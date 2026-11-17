import { serializeSchema } from '../lib/seo.ts';

export default function StructuredData({ value }: { value: unknown }) {
  return (
    <script
      id="weather-atlas-structured-data"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeSchema(value) }}
    />
  );
}
