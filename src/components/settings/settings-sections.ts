import {
  Coins,
  CalendarDays,
  FileText,
  KeyRound,
  LayoutGrid,
  LayoutPanelTop,
  HeartHandshake,
  MonitorSmartphone,
  Palette,
  PlugZap,
  Shield,
  ShieldCheck,
  Sparkles,
  Tags,
  TimerReset,
  Trash2,
  User,
  UsersRound,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { hasMinRole, type AccountRole } from '@/lib/auth/roles';

/**
 * Settings information architecture for the redesigned page.
 *
 * The flat tab strip became a grouped left rail with a new Overview
 * landing. The URL query param stays `?tab=` (deep-linkable, and it
 * keeps the existing links in sidebar.tsx / header.tsx working) — we
 * just map the old values onto the new sections.
 */
export const SETTINGS_SECTIONS = [
  'overview',
  'general',
  'profile',
  'work-time',
  'clinic',
  'portal',
  'security',
  'privacy',
  'appearance',
  'whatsapp',
  'templates',
  'quick-replies',
  'automated-messages',
  'fields',
  'deals',
  'referrals',
  'roles',
  'members',
  'api',
  'data-cleanup',
  'new-features',
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const DEFAULT_SECTION: SettingsSection = 'overview';

/** Rail grouping. `adminOnly` items are hidden for non-admins. */
export interface SectionMeta {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
  group:
    | 'main'
    | 'account'
    | 'operation'
    | 'clinic'
    | 'messaging'
    | 'crm'
    | 'system';
  minRole?: AccountRole;
}

export const SECTION_META: Record<SettingsSection, SectionMeta> = {
  overview: {
    id: 'overview',
    label: 'Overview',
    icon: LayoutGrid,
    group: 'main',
  },
  general: {
    id: 'general',
    label: 'General',
    icon: LayoutPanelTop,
    group: 'main',
    minRole: 'admin',
  },
  profile: {
    id: 'profile',
    label: 'Your profile',
    icon: User,
    group: 'account',
  },
  'work-time': {
    id: 'work-time',
    label: 'Work time',
    icon: TimerReset,
    group: 'operation',
  },
  clinic: {
    id: 'clinic',
    label: 'Clinic',
    icon: CalendarDays,
    group: 'clinic',
    minRole: 'admin',
  },
  portal: {
    id: 'portal',
    label: 'Client portal',
    icon: MonitorSmartphone,
    group: 'clinic',
    minRole: 'admin',
  },
  security: {
    id: 'security',
    label: 'Login & security',
    icon: Shield,
    group: 'account',
  },
  privacy: {
    id: 'privacy',
    label: 'Privacy & GDPR',
    icon: ShieldCheck,
    group: 'account',
    minRole: 'admin',
  },
  appearance: {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    group: 'system',
  },
  whatsapp: {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: PlugZap,
    group: 'messaging',
    minRole: 'admin',
  },
  templates: {
    id: 'templates',
    label: 'Templates',
    icon: FileText,
    group: 'messaging',
    minRole: 'admin',
  },
  'quick-replies': {
    id: 'quick-replies',
    label: 'Internal templates',
    icon: Zap,
    group: 'messaging',
    minRole: 'agent',
  },
  'automated-messages': {
    id: 'automated-messages',
    label: 'Mensagens automáticas',
    icon: Zap,
    group: 'messaging',
    minRole: 'admin',
  },
  fields: {
    id: 'fields',
    label: 'Fields & tags',
    icon: Tags,
    group: 'crm',
    minRole: 'admin',
  },
  deals: {
    id: 'deals',
    label: 'Deals & currency',
    icon: Coins,
    group: 'crm',
    minRole: 'admin',
  },
  referrals: {
    id: 'referrals',
    label: 'Refer a friend',
    icon: HeartHandshake,
    group: 'crm',
    minRole: 'admin',
  },
  roles: {
    id: 'roles',
    label: 'Roles & access',
    icon: Shield,
    group: 'operation',
    minRole: 'admin',
  },
  members: {
    id: 'members',
    label: 'Team members',
    icon: UsersRound,
    group: 'operation',
    minRole: 'admin',
  },
  api: {
    id: 'api',
    label: 'API keys',
    icon: KeyRound,
    group: 'system',
    minRole: 'admin',
  },
  'data-cleanup': {
    id: 'data-cleanup',
    label: 'Data cleanup',
    icon: Trash2,
    group: 'system',
    minRole: 'owner',
  },
  'new-features': {
    id: 'new-features',
    label: 'New features',
    icon: Sparkles,
    group: 'system',
    minRole: 'owner',
  },
};

export const RAIL_GROUPS: {
  group: SectionMeta['group'];
}[] = [
  { group: 'main' },
  { group: 'account' },
  { group: 'operation' },
  { group: 'clinic' },
  { group: 'messaging' },
  { group: 'crm' },
  { group: 'system' },
];

function isSection(value: string | null): value is SettingsSection {
  return !!value && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/**
 * Resolve a raw `?tab=` value to a section. Legacy tabs from the old
 * flat layout collapse onto their new home (Tags + Custom fields → the
 * merged "Fields & tags" section). Anything unknown falls back to the
 * Overview landing.
 */
export function resolveSection(raw: string | null): SettingsSection {
  if (raw === 'tags' || raw === 'custom-fields') return 'fields';
  if (isSection(raw)) return raw;
  return DEFAULT_SECTION;
}

export function canAccessSettingsSection(
  role: AccountRole | null | undefined,
  section: SettingsSection
) {
  const minRole = SECTION_META[section].minRole;
  if (!minRole) return true;
  return !!role && hasMinRole(role, minRole);
}

export function getVisibleSettingsSections(
  role: AccountRole | null | undefined
) {
  return SETTINGS_SECTIONS.filter((section) =>
    canAccessSettingsSection(role, section)
  );
}

export function resolveAllowedSection(
  raw: string | null,
  role: AccountRole | null | undefined
): SettingsSection {
  const requested = resolveSection(raw);
  if (canAccessSettingsSection(role, requested)) return requested;

  const visible = getVisibleSettingsSections(role);
  return visible[0] ?? DEFAULT_SECTION;
}
