export interface LocalPageProps<Extra extends object = object> {
  params: Promise<{ locale: string } & Extra>;
}
