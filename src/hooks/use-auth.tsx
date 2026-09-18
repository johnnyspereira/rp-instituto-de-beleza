'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { DEFAULT_CURRENCY } from '@/lib/currency';
import {
  canEditSettings as canEditSettingsFor,
  canManageMembers as canManageMembersFor,
  canSendMessages as canSendMessagesFor,
  isAccountRole,
  type AccountRole,
} from '@/lib/auth/roles';
import type { CrmLocale, NavigationLayout } from '@/lib/account-preferences';

interface AuthUser {
  id: string;
  email: string;
  created_at: string;
  email_confirmed_at: string | null;
  confirmed_at: string | null;
  last_sign_in_at: string | null;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  role: string | null;
  beta_features: string[];
  account_id: string | null;
  account_role: AccountRole | null;
}

interface AccountSummary {
  id: string;
  name: string;
  default_currency: string;
  crm_locale: CrmLocale;
  timezone: string;
  public_url: string | null;
  navigation_layout: NavigationLayout;
  logo_url: string | null;
  new_feature_badges_enabled: boolean;
}

interface LocalSessionPayload {
  session: {
    user: AuthUser;
    profile: Profile;
    account: AccountSummary;
    expiresAt: string;
  } | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  accountId: string | null;
  accountRole: AccountRole | null;
  account: AccountSummary | null;
  defaultCurrency: string;
  isOwner: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  isViewer: boolean;
  canManageMembers: boolean;
  canEditSettings: boolean;
  canSendMessages: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);

  const loadSession = useCallback(async () => {
    setProfileLoading(true);
    try {
      const response = await fetch('/api/auth/session', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Unable to load local session.');

      const { session } = (await response.json()) as LocalSessionPayload;
      if (!session) {
        setUser(null);
        setProfile(null);
        setAccount(null);
        return;
      }

      setUser(session.user);
      setProfile({
        ...session.profile,
        account_role: isAccountRole(session.profile.account_role)
          ? session.profile.account_role
          : null,
        beta_features: Array.isArray(session.profile.beta_features)
          ? session.profile.beta_features
          : [],
      });
      setAccount({
        ...session.account,
        default_currency: session.account.default_currency || DEFAULT_CURRENCY,
        crm_locale:
          session.account.crm_locale === 'en' ? 'en' : ('pt' as const),
        navigation_layout:
          session.account.navigation_layout === 'topbar'
            ? 'topbar'
            : ('sidebar' as const),
      });
    } catch (error) {
      console.error('[AuthProvider] local session error:', error);
      setUser(null);
      setProfile(null);
      setAccount(null);
    } finally {
      setLoading(false);
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: false }),
    });
    setUser(null);
    setProfile(null);
    setAccount(null);
    window.location.href = '/login';
  }, []);

  const derived = useMemo(() => {
    const role = profile?.account_role ?? null;
    return {
      accountRole: role,
      accountId: profile?.account_id ?? null,
      isOwner: role === 'owner',
      isAdmin: role === 'admin',
      isAgent: role === 'agent',
      isViewer: role === 'viewer',
      canManageMembers: role ? canManageMembersFor(role) : false,
      canEditSettings: role ? canEditSettingsFor(role) : false,
      canSendMessages: role ? canSendMessagesFor(role) : false,
    };
  }, [profile?.account_id, profile?.account_role]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        profileLoading,
        signOut,
        refreshProfile: loadSession,
        account,
        defaultCurrency: account?.default_currency ?? DEFAULT_CURRENCY,
        ...derived,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context) return context;

  return {
    user: null,
    profile: null,
    loading: false,
    profileLoading: false,
    signOut: async () => {
      window.location.href = '/login';
    },
    refreshProfile: async () => {},
    account: null,
    defaultCurrency: DEFAULT_CURRENCY,
    accountId: null,
    accountRole: null,
    isOwner: false,
    isAdmin: false,
    isAgent: false,
    isViewer: false,
    canManageMembers: false,
    canEditSettings: false,
    canSendMessages: false,
  };
}
