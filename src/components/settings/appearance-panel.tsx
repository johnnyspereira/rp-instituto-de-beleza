'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import {
  Check,
  LayoutDashboard,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Save,
  Sparkles,
  Sun,
  SunMoon,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTheme } from '@/hooks/use-theme';
import {
  DEFAULT_MODE,
  DEFAULT_THEME,
  MODES,
  THEMES,
  type AppliedMode,
  type Mode,
  type ThemeId,
} from '@/lib/themes';
import { cn } from '@/lib/utils';
import { SettingsPanelHead } from './settings-panel-head';

const MODE_ICONS: Record<Mode, LucideIcon> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const PRIMARY_FOREGROUNDS: Record<ThemeId, string> = {
  violet: 'oklch(0.985 0 0)',
  emerald: 'oklch(0.16 0.02 162)',
  teal: 'oklch(0.14 0.02 190)',
  sky: 'oklch(0.14 0.02 235)',
  cobalt: 'oklch(0.985 0 0)',
  indigo: 'oklch(0.985 0 0)',
  fuchsia: 'oklch(0.985 0 0)',
  amber: 'oklch(0.18 0.03 65)',
  coral: 'oklch(0.18 0.03 32)',
  lime: 'oklch(0.16 0.03 135)',
  rose: 'oklch(0.985 0 0)',
  ruby: 'oklch(0.985 0 0)',
};

type PreviewTokenStyle = CSSProperties & Record<`--${string}`, string>;

export function AppearancePanel() {
  const { theme, setTheme, mode, effectiveMode, setMode } = useTheme();
  const t = useTranslations('Settings.appearance');
  const [draftTheme, setDraftTheme] = useState<ThemeId>(theme);
  const [draftMode, setDraftMode] = useState<Mode>(mode);
  const [systemMode, setSystemMode] = useState<AppliedMode>(effectiveMode);
  const currentTheme =
    THEMES.find((item) => item.id === draftTheme) ?? THEMES[0];
  const draftEffectiveMode = draftMode === 'system' ? systemMode : draftMode;
  const hasChanges = draftTheme !== theme || draftMode !== mode;

  useEffect(() => {
    setDraftTheme(theme);
  }, [theme]);

  useEffect(() => {
    setDraftMode(mode);
  }, [mode]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncSystemMode = () => {
      setSystemMode(media.matches ? 'dark' : 'light');
    };

    syncSystemMode();
    media.addEventListener('change', syncSystemMode);
    return () => media.removeEventListener('change', syncSystemMode);
  }, []);

  function resetAppearance() {
    setDraftTheme(DEFAULT_THEME);
    setDraftMode(DEFAULT_MODE);
    toast.success(t('resetToast'));
  }

  function discardChanges() {
    setDraftTheme(theme);
    setDraftMode(mode);
    toast.success(t('discardToast'));
  }

  function saveAppearance() {
    setTheme(draftTheme);
    setMode(draftMode);
    toast.success(t('saveToast'));
  }

  return (
    <section className="animate-in fade-in-50 max-w-6xl duration-200">
      <SettingsPanelHead title={t('title')} description={t('description')} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="text-primary h-4 w-4" />
                    {t('currentLook')}
                  </CardTitle>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {t('currentLookDesc')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {hasChanges && (
                    <Badge className="bg-primary-soft text-primary hover:bg-primary-soft">
                      {t('unsaved')}
                    </Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={discardChanges}
                    disabled={!hasChanges}
                  >
                    {t('discard')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={resetAppearance}>
                    <RotateCcw className="h-4 w-4" />
                    {t('reset')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveAppearance}
                    disabled={!hasChanges}
                  >
                    <Save className="h-4 w-4" />
                    {t('save')}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                <SummaryTile
                  label={t('preference')}
                  value={t(`modeLabel.${draftMode}`)}
                  detail={
                    draftMode === 'system'
                      ? t('systemResolved', {
                          mode: t(`modeLabel.${draftEffectiveMode}`),
                        })
                      : t('manualMode')
                  }
                  icon={MODE_ICONS[draftMode]}
                />
                <SummaryTile
                  label={t('effectiveMode')}
                  value={t(`modeLabel.${draftEffectiveMode}`)}
                  detail={t('effectiveModeDesc')}
                  icon={draftEffectiveMode === 'dark' ? Moon : Sun}
                />
                <SummaryTile
                  label={t('accentColor')}
                  value={t(`themes.${currentTheme.id}.name`)}
                  detail={hasChanges ? t('pendingSave') : t('deviceSaved')}
                  icon={Palette}
                  swatch={currentTheme.swatch}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <SunMoon className="text-primary h-4 w-4" />
                {t('mode')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                role="radiogroup"
                aria-label={t('mode')}
                className="grid gap-3 md:grid-cols-3"
              >
                {MODES.map((item) => (
                  <ModeCard
                    key={item}
                    mode={item}
                    isActive={item === draftMode}
                    effectiveMode={draftEffectiveMode}
                    onPick={() => setDraftMode(item)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Palette className="text-primary h-4 w-4" />
                {t('accentColor')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {THEMES.map((item) => (
                  <ThemeCard
                    key={item.id}
                    id={item.id}
                    swatch={item.swatch}
                    isActive={item.id === draftTheme}
                    onPick={() => setDraftTheme(item.id)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <AppearancePreview
          themeId={currentTheme.id}
          swatch={currentTheme.swatch}
          mode={draftEffectiveMode}
          themeName={t(`themes.${currentTheme.id}.name`)}
        />
      </div>
    </section>
  );
}

function SummaryTile({
  label,
  value,
  detail,
  icon: Icon,
  swatch,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  swatch?: string;
}) {
  return (
    <div className="border-border bg-muted/30 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium">{label}</p>
          <p className="text-foreground mt-1 truncate text-sm font-semibold">
            {value}
          </p>
        </div>
        <span
          className="bg-primary-soft text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          style={swatch ? { background: swatch } : undefined}
        >
          <Icon
            className={cn('h-4 w-4', swatch && 'text-primary-foreground')}
          />
        </span>
      </div>
      <p className="text-muted-foreground mt-2 line-clamp-2 text-xs">
        {detail}
      </p>
    </div>
  );
}

function ModeCard({
  mode,
  isActive,
  effectiveMode,
  onPick,
}: {
  mode: Mode;
  isActive: boolean;
  effectiveMode: 'light' | 'dark';
  onPick: () => void;
}) {
  const t = useTranslations('Settings.appearance');
  const Icon = MODE_ICONS[mode];
  const previewMode = mode === 'system' ? effectiveMode : mode;

  return (
    <button
      type="button"
      role="radio"
      onClick={onPick}
      aria-checked={isActive}
      aria-label={t('useMode', { mode: t(`modeLabel.${mode}`) })}
      className={cn(
        'bg-card rounded-lg border p-4 text-left transition-colors',
        isActive
          ? 'border-primary/60 ring-primary/35 ring-2'
          : 'border-border hover:bg-muted/40'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="bg-muted text-foreground flex h-10 w-10 items-center justify-center rounded-md">
          <Icon className="h-4 w-4" />
        </span>
        {isActive && (
          <Badge className="bg-primary-soft text-primary hover:bg-primary-soft">
            <Check className="h-3 w-3" />
            {t('active')}
          </Badge>
        )}
      </div>
      <div className="mt-4">
        <div className="text-foreground text-sm font-semibold">
          {t(`modeLabel.${mode}`)}
        </div>
        <div className="text-muted-foreground mt-1 text-xs leading-relaxed">
          {t(`modeDesc.${mode}`)}
        </div>
      </div>
      <div className="border-border mt-4 overflow-hidden rounded-md border">
        <div
          className={cn(
            'h-16 p-2',
            previewMode === 'dark' ? 'bg-slate-950' : 'bg-white'
          )}
        >
          <div
            className={cn(
              'mb-2 h-2.5 w-14 rounded-full',
              previewMode === 'dark' ? 'bg-slate-700' : 'bg-slate-200'
            )}
          />
          <div className="flex gap-1.5">
            <span className="bg-primary h-8 flex-1 rounded" />
            <span
              className={cn(
                'h-8 flex-1 rounded',
                previewMode === 'dark' ? 'bg-slate-800' : 'bg-slate-100'
              )}
            />
          </div>
        </div>
      </div>
    </button>
  );
}

function ThemeCard({
  id,
  swatch,
  isActive,
  onPick,
}: {
  id: ThemeId;
  swatch: string;
  isActive: boolean;
  onPick: () => void;
}) {
  const t = useTranslations('Settings.appearance');
  const name = t(`themes.${id}.name`);

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={isActive}
      aria-label={t('useTheme', { name })}
      className={cn(
        'bg-card rounded-lg border p-4 text-left transition-colors',
        isActive
          ? 'border-primary/60 ring-primary/35 ring-2'
          : 'border-border hover:bg-muted/40'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="h-10 w-10 shrink-0 rounded-md"
            style={{
              background: swatch,
              boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.16)',
            }}
          />
          <div>
            <div className="text-foreground text-sm font-semibold">{name}</div>
            <div className="text-muted-foreground mt-0.5 text-xs">
              {t(`themes.${id}.mood`)}
            </div>
          </div>
        </div>
        {isActive && <Check className="text-primary h-4 w-4 shrink-0" />}
      </div>
      <p className="text-muted-foreground mt-3 line-clamp-2 text-xs leading-relaxed">
        {t(`themes.${id}.desc`)}
      </p>
      <div className="mt-4 grid grid-cols-5 gap-1" aria-hidden>
        <span className="h-2 rounded-full" style={{ background: swatch }} />
        <span
          className="h-2 rounded-full"
          style={{ background: withAlpha(swatch, 0.22) }}
        />
        <span className="bg-muted h-2 rounded-full" />
        <span className="bg-card-2 h-2 rounded-full" />
        <span className="bg-border h-2 rounded-full" />
      </div>
    </button>
  );
}

function AppearancePreview({
  themeId,
  swatch,
  mode,
  themeName,
}: {
  themeId: ThemeId;
  swatch: string;
  mode: AppliedMode;
  themeName: string;
}) {
  const t = useTranslations('Settings.appearance');
  const previewStyle = getPreviewStyle(mode, themeId, swatch);

  return (
    <Card className="xl:sticky xl:top-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <LayoutDashboard className="text-primary h-4 w-4" />
          {t('previewTitle')}
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          {t('previewDesc', { theme: themeName })}
        </p>
      </CardHeader>
      <CardContent>
        <div
          className="border-border bg-background overflow-hidden rounded-lg border shadow-sm"
          style={previewStyle}
        >
          <div className="border-border bg-card flex h-10 items-center gap-2 border-b px-3">
            <span className="bg-primary h-2.5 w-2.5 rounded-full" />
            <span className="text-foreground text-xs font-semibold">
              ZapSend
            </span>
            <span className="bg-muted ml-auto h-6 w-16 rounded-md" />
          </div>
          <div className="grid min-h-80 grid-cols-[108px_minmax(0,1fr)]">
            <aside className="border-border bg-card border-r p-2">
              {[
                t('previewNavInbox'),
                t('previewNavPipeline'),
                t('previewNavSettings'),
              ].map((item, index) => (
                <div
                  key={item}
                  className={cn(
                    'mb-1 rounded-md px-2 py-2 text-[11px]',
                    index === 0
                      ? 'bg-primary-soft text-primary'
                      : 'text-muted-foreground'
                  )}
                >
                  {item}
                </div>
              ))}
            </aside>
            <main className="p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-foreground text-xs font-semibold">
                    {t('previewInbox')}
                  </div>
                  <div className="text-muted-foreground text-[11px]">
                    {t('previewInboxDesc')}
                  </div>
                </div>
                <Badge className="bg-primary text-primary-foreground">
                  {t('previewOpen')}
                </Badge>
              </div>
              <div className="space-y-2">
                <div className="bg-muted text-foreground rounded-lg p-3 text-xs">
                  {t('previewClientMessage')}
                </div>
                <div className="bg-primary text-primary-foreground ml-auto max-w-[78%] rounded-lg p-3 text-xs">
                  {t('previewAgentMessage')}
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div className="border-border bg-card rounded-lg border p-3">
                    <div className="text-muted-foreground text-[10px]">
                      {t('previewMetricOne')}
                    </div>
                    <div className="text-foreground mt-1 text-lg font-semibold">
                      24
                    </div>
                  </div>
                  <div className="border-border bg-card rounded-lg border p-3">
                    <div className="text-muted-foreground text-[10px]">
                      {t('previewMetricTwo')}
                    </div>
                    <div className="text-foreground mt-1 text-lg font-semibold">
                      91%
                    </div>
                  </div>
                </div>
              </div>
            </main>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getPreviewStyle(
  mode: AppliedMode,
  themeId: ThemeId,
  swatch: string
): PreviewTokenStyle {
  const surface =
    mode === 'dark'
      ? {
          '--background': 'oklch(0.13 0.01 260)',
          '--foreground': 'oklch(0.985 0 0)',
          '--card': 'oklch(0.18 0.01 260)',
          '--card-2': 'oklch(0.205 0.01 260)',
          '--card-foreground': 'oklch(0.985 0 0)',
          '--muted': 'oklch(0.22 0.01 260)',
          '--muted-foreground': 'oklch(0.65 0.01 260)',
          '--border': 'oklch(0.28 0.01 260)',
        }
      : {
          '--background': 'oklch(0.99 0.002 260)',
          '--foreground': 'oklch(0.21 0.01 260)',
          '--card': 'oklch(1 0 0)',
          '--card-2': 'oklch(0.985 0.002 260)',
          '--card-foreground': 'oklch(0.21 0.01 260)',
          '--muted': 'oklch(0.967 0.003 260)',
          '--muted-foreground': 'oklch(0.52 0.015 260)',
          '--border': 'oklch(0.922 0.004 260)',
        };

  return {
    ...surface,
    '--primary': swatch,
    '--primary-foreground': PRIMARY_FOREGROUNDS[themeId],
    '--primary-hover': swatch,
    '--primary-soft': withAlpha(swatch, 0.12),
    '--primary-soft-2': withAlpha(swatch, mode === 'dark' ? 0.2 : 0.22),
  };
}

function withAlpha(oklch: string, alpha: number) {
  return oklch.replace(/\)$/, ` / ${alpha})`);
}
