'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import {
  DEFAULT_MODE,
  DEFAULT_THEME,
  MODE_STORAGE_KEY,
  STORAGE_KEY,
  getSystemMode,
  isMode,
  isThemeId,
  resolveAppliedMode,
  type AppliedMode,
  type Mode,
  type ThemeId,
} from '@/lib/themes';

/**
 * ThemeProvider — wraps the whole app, owns the two theming axes:
 *   • `theme` — the accent color (`data-theme` on <html>)
 *   • `mode`  — light / dark (`data-mode` on <html>)
 * The two are independent, so any accent renders in either mode.
 *
 * The boot script in `src/app/layout.tsx` has already applied both
 * `data-theme` and `data-mode` before React hydrates, so by the time
 * this Provider mounts the page is already painted correctly. We just
 * read what's there and keep it in sync going forward.
 *
 * Persistence is localStorage only (device-scoped). A future
 * follow-up could mirror to `profiles.preferences` for cross-device
 * sync, but a per-device choice is also defensible — your phone may
 * deserve a different theme than your laptop.
 */

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (next: ThemeId) => void;
  mode: Mode;
  effectiveMode: AppliedMode;
  setMode: (next: Mode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  // Whatever the boot script applied is the truth. Fall back to
  // localStorage / default if for some reason the attribute is missing
  // (e.g. someone bypassed the boot script in a custom layout).
  const fromAttr = document.documentElement.dataset.theme;
  if (isThemeId(fromAttr)) return fromAttr;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isThemeId(stored)) return stored;
  } catch {
    // localStorage can throw in private-browsing / sandboxed contexts.
  }
  return DEFAULT_THEME;
}

function readInitialMode(): Mode {
  if (typeof window === 'undefined') return DEFAULT_MODE;
  // `data-mode` stores the applied surface (light/dark). The saved
  // preference may still be `system`, so localStorage is the source of
  // truth for the selector value.
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    if (isMode(stored)) return stored;
  } catch {
    // localStorage can throw in private-browsing / sandboxed contexts.
  }
  const fromAttr = document.documentElement.dataset.mode;
  if (isMode(fromAttr)) return fromAttr;
  return DEFAULT_MODE;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(readInitialTheme);
  const [mode, setModeState] = useState<Mode>(readInitialMode);
  const [effectiveMode, setEffectiveMode] = useState<AppliedMode>(() =>
    resolveAppliedMode(readInitialMode())
  );

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = next;
    }
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Same private-browsing edge case as above; the in-memory state
      // still updates so the current tab works for the session.
    }
  }, []);

  const setMode = useCallback((next: Mode) => {
    const applied = resolveAppliedMode(next);
    setModeState(next);
    setEffectiveMode(applied);
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.mode = applied;
    }
    try {
      localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
      // Same private-browsing edge case as above.
    }
  }, []);

  const toggleMode = useCallback(() => {
    setMode(effectiveMode === 'dark' ? 'light' : 'dark');
  }, [effectiveMode, setMode]);

  // Sync from other tabs — change theme or mode in tab A, tab B
  // catches up without a refresh.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        if (isThemeId(e.newValue) && e.newValue !== theme) {
          setThemeState(e.newValue);
          document.documentElement.dataset.theme = e.newValue;
        }
        return;
      }
      if (e.key === MODE_STORAGE_KEY) {
        if (isMode(e.newValue) && e.newValue !== mode) {
          const applied = resolveAppliedMode(e.newValue);
          setModeState(e.newValue);
          setEffectiveMode(applied);
          document.documentElement.dataset.mode = applied;
        }
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [theme, mode]);

  useEffect(() => {
    if (mode !== 'system' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const applied = getSystemMode();
      setEffectiveMode(applied);
      document.documentElement.dataset.mode = applied;
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [mode]);

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, mode, effectiveMode, setMode, toggleMode }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback for components rendered outside the provider — return
    // no-op setters so callers don't crash. The boot script still
    // applied the right CSS attributes, so visually the page is fine.
    return {
      theme: DEFAULT_THEME,
      setTheme: () => {},
      mode: DEFAULT_MODE,
      effectiveMode: resolveAppliedMode(DEFAULT_MODE),
      setMode: () => {},
      toggleMode: () => {},
    };
  }
  return ctx;
}
