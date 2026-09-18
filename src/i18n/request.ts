import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

const SUPPORTED_LOCALES = ['pt', 'en'] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function normalizeLocale(value: string | undefined): SupportedLocale {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale)
    ? (value as SupportedLocale)
    : 'pt';
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = normalizeLocale(
    cookieStore.get('crm_locale')?.value || process.env.NEXT_PUBLIC_APP_LOCALE
  );

  let messages;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch {
    // Fallback to English if the dictionary for the requested locale doesn't exist yet
    messages = (await import(`../../messages/en.json`)).default;
  }

  return {
    locale,
    messages,
  };
});
