'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Building2,
  ExternalLink,
  Globe2,
  LayoutDashboard,
  Link2,
  Loader2,
  MapPin,
  MonitorSmartphone,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  setCrmLocaleCookie,
  writeLocalAccountPreferences,
  type CrmLocale,
  type NavigationLayout,
} from '@/lib/account-preferences';
import { cn } from '@/lib/utils';
import { EmailDeliveryPanel } from './email-delivery-panel';

const BRANDING_BUCKET = 'account-branding';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);

const LANGUAGE_OPTIONS = [
  { value: 'pt', label: 'Português' },
  { value: 'en', label: 'English' },
] as const;

const TIMEZONE_OPTIONS = [
  'Europe/Lisbon',
  'America/Sao_Paulo',
  'America/New_York',
  'America/Mexico_City',
  'Europe/Madrid',
  'Europe/London',
  'UTC',
];

function normalizeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    return new URL(withProtocol).toString();
  } catch {
    return trimmed;
  }
}

function isMissingGeneralSettingsColumn(error: {
  code?: string;
  message?: string;
}) {
  const message = (error.message ?? '').toLowerCase();
  return (
    error.code === '42703' ||
    (message.includes('schema cache') && message.includes('accounts')) ||
    message.includes('accounts.crm_locale') ||
    message.includes('accounts.timezone') ||
    message.includes('accounts.public_url') ||
    message.includes('accounts.navigation_layout') ||
    message.includes('accounts.logo_url')
  );
}

export function GeneralSettings() {
  const t = useTranslations('Settings.general');
  const router = useRouter();
  const { account, accountId, canEditSettings, refreshProfile } = useAuth();
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [crmName, setCrmName] = useState(account?.name ?? '');
  const [logoUrl, setLogoUrl] = useState(account?.logo_url ?? '');
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [publicUrl, setPublicUrl] = useState(account?.public_url ?? '');
  const [locale, setLocale] = useState<CrmLocale>(account?.crm_locale ?? 'pt');
  const [timezone, setTimezone] = useState(
    account?.timezone ?? 'Europe/Lisbon'
  );
  const [navigationLayout, setNavigationLayout] = useState<NavigationLayout>(
    account?.navigation_layout ?? 'sidebar'
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!account) return;
    setCrmName(account.name);
    setLogoUrl(account.logo_url ?? '');
    setPublicUrl(account.public_url ?? '');
    setLocale(account.crm_locale);
    setTimezone(account.timezone);
    setNavigationLayout(account.navigation_layout);
  }, [account]);

  useEffect(() => {
    return () => {
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    };
  }, [logoPreviewUrl]);

  const previewUrl = useMemo(() => normalizeUrl(publicUrl), [publicUrl]);
  const normalizedLogoUrl = useMemo(() => normalizeUrl(logoUrl), [logoUrl]);
  const currentLogoUrl =
    logoPreviewUrl ?? (!removeLogo ? normalizedLogoUrl : null);
  const initials = (crmName.trim() || account?.name || 'CRM')
    .slice(0, 2)
    .toUpperCase();

  function pickLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!ALLOWED_LOGO_MIME.has(file.type)) {
      toast.error(t('logoInvalidType'));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(t('logoTooLarge'));
      return;
    }

    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    setPendingLogo(file);
    setLogoPreviewUrl(URL.createObjectURL(file));
    setRemoveLogo(false);
  }

  function clearLogo() {
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    setPendingLogo(null);
    setLogoPreviewUrl(null);
    setLogoUrl('');
    setRemoveLogo(true);
  }

  async function uploadLogoIfNeeded() {
    if (!pendingLogo || !accountId) {
      return removeLogo ? null : normalizedLogoUrl;
    }

    const ext = pendingLogo.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `account-${accountId}/logo-${Date.now()}.${ext}`;
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(BRANDING_BUCKET)
      .upload(path, pendingLogo, {
        cacheControl: '3600',
        upsert: true,
        contentType: pendingLogo.type,
      });

    if (uploadError) {
      throw new Error(t('logoUploadFailed', { message: uploadError.message }));
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(path);
    return publicUrl;
  }

  async function handleSave() {
    if (!accountId) return;
    const name = crmName.trim();
    if (!name) {
      toast.error(t('nameRequired'));
      return;
    }

    setSaving(true);
    const previousLocale = account?.crm_locale ?? 'pt';

    try {
      const nextLogoUrl = await uploadLogoIfNeeded();
      const normalizedPublicUrl = normalizeUrl(publicUrl);
      const preferences = {
        public_url: normalizedPublicUrl,
        crm_locale: locale,
        timezone,
        navigation_layout: navigationLayout,
        logo_url: nextLogoUrl,
      };
      const supabase = createClient();
      const { error } = await supabase
        .from('accounts')
        .update({
          name,
          ...preferences,
        })
        .eq('id', accountId);

      let savedWithFallback = false;
      if (error) {
        if (!isMissingGeneralSettingsColumn(error)) {
          throw new Error(error.message);
        }

        const { error: withoutLogoError } = await supabase
          .from('accounts')
          .update({
            name,
            public_url: normalizedPublicUrl,
            crm_locale: locale,
            timezone,
            navigation_layout: navigationLayout,
          })
          .eq('id', accountId);

        if (withoutLogoError) {
          if (!isMissingGeneralSettingsColumn(withoutLogoError)) {
            throw new Error(withoutLogoError.message);
          }

          const { error: nameOnlyError } = await supabase
            .from('accounts')
            .update({ name })
            .eq('id', accountId);

          if (nameOnlyError) throw new Error(nameOnlyError.message);
        }
        savedWithFallback = true;
      }

      writeLocalAccountPreferences(accountId, preferences);
      setCrmLocaleCookie(locale);
      setPendingLogo(null);
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
      setLogoPreviewUrl(null);
      setRemoveLogo(false);
      setLogoUrl(nextLogoUrl ?? '');
      await refreshProfile();
      toast.success(savedWithFallback ? t('savedLocalFallback') : t('saved'));

      if (locale !== previousLocale) {
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="animate-in fade-in-50 max-w-6xl space-y-4 duration-200">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Building2 className="text-primary size-4" />
                {t('identityTitle')}
              </CardTitle>
              <CardDescription>{t('identityDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap items-center gap-5">
                <div className="border-border bg-muted/40 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
                  {currentLogoUrl ? (
                    <img
                      src={currentLogoUrl}
                      alt={t('logoAlt')}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-primary text-lg font-semibold">
                      {initials}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={pickLogo}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={!canEditSettings || saving}
                    >
                      <Upload className="size-4" />
                      {currentLogoUrl ? t('changeLogo') : t('uploadLogo')}
                    </Button>
                    {currentLogoUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={clearLogo}
                        disabled={!canEditSettings || saving}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Trash2 className="size-4" />
                        {t('removeLogo')}
                      </Button>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {t('logoHint')}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="space-y-2">
                  <Label>{t('crmName')}</Label>
                  <Input
                    value={crmName}
                    onChange={(event) => setCrmName(event.target.value)}
                    disabled={!canEditSettings || saving}
                    placeholder={t('crmNamePlaceholder')}
                    className="bg-muted"
                  />
                </label>

                <label className="space-y-2">
                  <Label>{t('logoUrl')}</Label>
                  <Input
                    value={logoUrl}
                    onChange={(event) => {
                      setLogoUrl(event.target.value);
                      setRemoveLogo(false);
                      if (logoPreviewUrl) {
                        URL.revokeObjectURL(logoPreviewUrl);
                        setLogoPreviewUrl(null);
                      }
                      setPendingLogo(null);
                    }}
                    disabled={
                      !canEditSettings || saving || Boolean(pendingLogo)
                    }
                    placeholder="https://seudominio.com/logo.png"
                    className="bg-muted"
                  />
                </label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Globe2 className="text-primary size-4" />
                {t('workspaceTitle')}
              </CardTitle>
              <CardDescription>{t('workspaceDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-2">
                <Label>{t('publicUrl')}</Label>
                <Input
                  value={publicUrl}
                  onChange={(event) => setPublicUrl(event.target.value)}
                  disabled={!canEditSettings || saving}
                  placeholder="https://seudominio.com"
                  className="bg-muted"
                />
                {previewUrl ? (
                  <p className="text-muted-foreground truncate text-xs">
                    {t('normalizedUrl')}: {previewUrl}
                  </p>
                ) : null}
              </label>

              <label className="space-y-2">
                <Label>{t('language')}</Label>
                <select
                  value={locale}
                  onChange={(event) =>
                    setLocale(event.target.value as CrmLocale)
                  }
                  disabled={!canEditSettings || saving}
                  className="border-border bg-muted text-foreground focus:border-primary h-10 w-full rounded-md border px-3 text-sm outline-none"
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 lg:col-span-2">
                <Label>{t('timezone')}</Label>
                <select
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  disabled={!canEditSettings || saving}
                  className="border-border bg-muted text-foreground focus:border-primary h-10 w-full rounded-md border px-3 text-sm outline-none"
                >
                  {TIMEZONE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <LayoutDashboard className="text-primary size-4" />
                {t('navigationTitle')}
              </CardTitle>
              <CardDescription>{t('navigationDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {(['sidebar', 'topbar'] as const).map((layout) => (
                  <button
                    key={layout}
                    type="button"
                    onClick={() => setNavigationLayout(layout)}
                    disabled={!canEditSettings || saving}
                    className={cn(
                      'rounded-md border p-4 text-left transition-colors',
                      navigationLayout === layout
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-muted/30 text-foreground hover:bg-muted'
                    )}
                  >
                    <p className="text-sm font-semibold">
                      {layout === 'sidebar' ? t('sidebar') : t('topbar')}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {layout === 'sidebar'
                        ? t('sidebarHint')
                        : t('topbarHint')}
                    </p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <GeneralPreview
          name={crmName.trim() || account?.name || 'CRM'}
          logoUrl={currentLogoUrl}
          initials={initials}
          publicUrl={previewUrl}
          locale={locale}
          timezone={timezone}
          navigationLayout={navigationLayout}
        />
      </div>

      {canEditSettings && <EmailDeliveryPanel />}

      <div className="flex items-center justify-end gap-3">
        {!canEditSettings && (
          <p className="text-muted-foreground text-xs">{t('adminOnly')}</p>
        )}
        <Button
          onClick={handleSave}
          disabled={!canEditSettings || saving || !crmName.trim()}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {saving ? t('saving') : t('save')}
        </Button>
      </div>
    </section>
  );
}

function GeneralPreview({
  name,
  logoUrl,
  initials,
  publicUrl,
  locale,
  timezone,
  navigationLayout,
}: {
  name: string;
  logoUrl: string | null;
  initials: string;
  publicUrl: string | null;
  locale: CrmLocale;
  timezone: string;
  navigationLayout: NavigationLayout;
}) {
  const t = useTranslations('Settings.general');

  return (
    <Card className="xl:sticky xl:top-4">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <MonitorSmartphone className="text-primary size-4" />
          {t('previewTitle')}
        </CardTitle>
        <CardDescription>{t('previewDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border-border bg-background overflow-hidden rounded-lg border">
          <div className="border-border bg-card flex h-12 items-center gap-2 border-b px-3">
            <BrandLogo logoUrl={logoUrl} initials={initials} />
            <span className="text-foreground min-w-0 truncate text-sm font-semibold">
              {name}
            </span>
          </div>
          <div className="grid grid-cols-[96px_minmax(0,1fr)]">
            <div className="border-border bg-card border-r p-2">
              <div className="bg-primary/10 mb-2 h-7 rounded-md" />
              <div className="bg-muted mb-2 h-7 rounded-md" />
              <div className="bg-muted h-7 rounded-md" />
            </div>
            <div className="space-y-2 p-3">
              <div className="bg-muted h-4 w-2/3 rounded" />
              <div className="bg-primary/10 h-16 rounded-lg" />
              <div className="grid grid-cols-2 gap-2">
                <div className="border-border bg-card h-12 rounded-lg border" />
                <div className="border-border bg-card h-12 rounded-lg border" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-2">
          <PreviewFact
            icon={Link2}
            label={t('previewDomain')}
            value={publicUrl ?? t('notConfigured')}
          />
          <PreviewFact
            icon={Globe2}
            label={t('previewLanguage')}
            value={locale === 'pt' ? 'Português' : 'English'}
          />
          <PreviewFact
            icon={MapPin}
            label={t('previewTimezone')}
            value={timezone}
          />
          <PreviewFact
            icon={LayoutDashboard}
            label={t('previewNavigation')}
            value={navigationLayout === 'sidebar' ? t('sidebar') : t('topbar')}
          />
        </div>

        {publicUrl ? (
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:text-primary-hover inline-flex items-center gap-1 text-xs font-medium"
          >
            {t('openPublicUrl')}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}

function BrandLogo({
  logoUrl,
  initials,
}: {
  logoUrl: string | null;
  initials: string;
}) {
  return (
    <span className="border-border bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border text-xs font-semibold">
      {logoUrl ? (
        <img src={logoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

function PreviewFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Globe2;
  label: string;
  value: string;
}) {
  return (
    <div className="border-border bg-muted/30 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <Badge variant="outline" className="max-w-[54%] truncate text-[10px]">
          {value}
        </Badge>
      </div>
    </div>
  );
}
