'use client';

export type CrmLocale = 'pt' | 'en';
export type NavigationLayout = 'sidebar' | 'topbar';

export interface LocalAccountPreferences {
  crm_locale?: CrmLocale;
  timezone?: string;
  public_url?: string | null;
  navigation_layout?: NavigationLayout;
  logo_url?: string | null;
}

const STORAGE_PREFIX = 'wacrm.accountPreferences.';

function storageKey(accountId: string) {
  return `${STORAGE_PREFIX}${accountId}`;
}

function isCrmLocale(value: unknown): value is CrmLocale {
  return value === 'pt' || value === 'en';
}

function isNavigationLayout(value: unknown): value is NavigationLayout {
  return value === 'sidebar' || value === 'topbar';
}

function normalizePreferences(value: unknown): LocalAccountPreferences {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  return {
    crm_locale: isCrmLocale(raw.crm_locale) ? raw.crm_locale : undefined,
    timezone: typeof raw.timezone === 'string' ? raw.timezone : undefined,
    public_url:
      raw.public_url === null || typeof raw.public_url === 'string'
        ? raw.public_url
        : undefined,
    navigation_layout: isNavigationLayout(raw.navigation_layout)
      ? raw.navigation_layout
      : undefined,
    logo_url:
      raw.logo_url === null || typeof raw.logo_url === 'string'
        ? raw.logo_url
        : undefined,
  };
}

export function readLocalAccountPreferences(
  accountId: string | null | undefined
): LocalAccountPreferences {
  if (!accountId || typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey(accountId));
    return raw ? normalizePreferences(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function writeLocalAccountPreferences(
  accountId: string,
  preferences: LocalAccountPreferences
) {
  if (typeof window === 'undefined') return;
  try {
    const current = readLocalAccountPreferences(accountId);
    window.localStorage.setItem(
      storageKey(accountId),
      JSON.stringify({ ...current, ...preferences })
    );
  } catch {
    // localStorage can be unavailable in private/sandboxed contexts.
  }
}

export function setCrmLocaleCookie(locale: CrmLocale) {
  if (typeof document === 'undefined') return;
  document.cookie = `crm_locale=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}
