/**
 * Single source of truth for the color-theme catalog.
 *
 * The CSS variables themselves live in `src/app/globals.css` under
 * `html[data-theme="..."]` blocks — that file is the one we paste
 * theme tokens into. This module only carries the metadata the UI
 * (settings picker, no-flash boot script) needs.
 *
 * Adding a new theme is a two-step change:
 *   1. Append the new `html[data-theme="<id>"]` block in globals.css
 *      with every token from an existing theme (use violet as the
 *      shape reference).
 *   2. Add an entry below. The order here drives the picker grid.
 */

export const THEME_IDS = [
  'violet',
  'emerald',
  'teal',
  'sky',
  'cobalt',
  'indigo',
  'fuchsia',
  'amber',
  'coral',
  'lime',
  'rose',
  'ruby',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = 'violet';

export const STORAGE_KEY = 'wacrm.theme';

/**
 * MODE — the light/dark dimension, orthogonal to the accent theme.
 *
 * The CSS variables live in `src/app/globals.css` under
 * `html[data-mode="..."]` blocks (neutral surfaces only). Applied
 * at runtime via `document.documentElement.dataset.mode`. Dark is
 * the historical default and stays the app's identity; light is the
 * opt-in eye-strain-friendly alternative.
 *
 * Persisted under its own localStorage key so it composes freely
 * with the accent choice (you can run Violet-light or Violet-dark).
 */
export const MODES = ['light', 'dark', 'system'] as const;

export type Mode = (typeof MODES)[number];
export type AppliedMode = Exclude<Mode, 'system'>;

export const DEFAULT_MODE: Mode = 'dark';

export const MODE_STORAGE_KEY = 'wacrm.mode';

export function isMode(value: unknown): value is Mode {
  return (
    typeof value === 'string' &&
    (MODES as ReadonlyArray<string>).includes(value)
  );
}

export function getSystemMode(): AppliedMode {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function resolveAppliedMode(mode: Mode): AppliedMode {
  return mode === 'system' ? getSystemMode() : mode;
}

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  tagline: string;
  /**
   * Static swatch color for the picker chip. Hard-coded so the boot
   * script / picker cards don't need a getComputedStyle round trip
   * before the page settles. Must mirror `--primary` of the same
   * theme in globals.css.
   */
  swatch: string;
}

export const THEMES: ReadonlyArray<ThemeMeta> = [
  {
    id: 'violet',
    name: 'Violet',
    tagline: 'The default — confident, slightly playful.',
    swatch: 'oklch(0.526 0.247 293)',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    tagline: 'Growth-coded, nods at messaging without copying WhatsApp green.',
    swatch: 'oklch(0.62 0.16 162)',
  },
  {
    id: 'teal',
    name: 'Teal',
    tagline: 'Fresh and precise for support-led teams.',
    swatch: 'oklch(0.62 0.16 190)',
  },
  {
    id: 'sky',
    name: 'Sky',
    tagline: 'Open, light, and very readable in daily operations.',
    swatch: 'oklch(0.68 0.14 235)',
  },
  {
    id: 'cobalt',
    name: 'Cobalt',
    tagline: 'Clean B2B-SaaS blue — calm and product-y.',
    swatch: 'oklch(0.585 0.2 254)',
  },
  {
    id: 'indigo',
    name: 'Indigo',
    tagline: 'Focused and technical without feeling cold.',
    swatch: 'oklch(0.54 0.22 275)',
  },
  {
    id: 'fuchsia',
    name: 'Fuchsia',
    tagline: 'Expressive, high-energy, and brand-forward.',
    swatch: 'oklch(0.63 0.24 322)',
  },
  {
    id: 'amber',
    name: 'Amber',
    tagline: 'Warm and friendly — feels good for SMB teams.',
    swatch: 'oklch(0.745 0.16 65)',
  },
  {
    id: 'coral',
    name: 'Coral',
    tagline: 'Warm service energy with more modern contrast.',
    swatch: 'oklch(0.68 0.18 32)',
  },
  {
    id: 'lime',
    name: 'Lime',
    tagline: 'Bright progress cues for fast-moving teams.',
    swatch: 'oklch(0.78 0.15 135)',
  },
  {
    id: 'rose',
    name: 'Rose',
    tagline: 'Bold and modern — D2C, creator-economy, lifestyle.',
    swatch: 'oklch(0.645 0.22 16)',
  },
  {
    id: 'ruby',
    name: 'Ruby',
    tagline: 'Strong, urgent, and commercial.',
    swatch: 'oklch(0.58 0.22 25)',
  },
];

export function isThemeId(value: unknown): value is ThemeId {
  return (
    typeof value === 'string' &&
    (THEME_IDS as ReadonlyArray<string>).includes(value)
  );
}
