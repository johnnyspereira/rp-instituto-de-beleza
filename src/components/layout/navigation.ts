import {
  Bell,
  Activity,
  BadgeEuro,
  BarChart3,
  Bot,
  CalendarDays,
  Clapperboard,
  GitBranch,
  LibraryBig,
  LayoutDashboard,
  MessageSquare,
  PackageCheck,
  Megaphone,
  LifeBuoy,
  CircleHelp,
  Globe2,
  HeartHandshake,
  ListFilter,
  Radio,
  Send,
  Settings,
  Sparkles,
  SquareCheckBig,
  Star,
  Target,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';

export interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  beta?: boolean;
  newBadge?: {
    key: string;
    label?: string;
    className?: string;
  };
}

const TODAY_NEW_BADGE = {
  label: 'NOVO',
  className:
    'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.16)]',
};

export const navItems: NavItem[] = [
  {
    href: '/dashboard',
    labelKey: 'dashboard',
    icon: LayoutDashboard,
    newBadge: { key: 'dashboard-followups', ...TODAY_NEW_BADGE },
  },
  { href: '/inbox', labelKey: 'inbox', icon: MessageSquare },
  { href: '/notifications', labelKey: 'notifications', icon: Bell },
  {
    href: '/tasks',
    labelKey: 'tasks',
    icon: SquareCheckBig,
    newBadge: { key: 'client-tasks', ...TODAY_NEW_BADGE },
  },
  { href: '/agenda', labelKey: 'agenda', icon: CalendarDays },
  { href: '/avaliacoes', labelKey: 'reviews', icon: Star },
  {
    href: '/contacts',
    labelKey: 'contacts',
    icon: Users,
    newBadge: { key: 'contacts-import-export', ...TODAY_NEW_BADGE },
  },
  { href: '/pipelines', labelKey: 'pipelines', icon: GitBranch },
  {
    href: '/finance',
    labelKey: 'finance',
    icon: BadgeEuro,
    newBadge: { key: 'retroactive-cash', ...TODAY_NEW_BADGE },
  },
  {
    href: '/benefits',
    labelKey: 'benefits',
    icon: PackageCheck,
    newBadge: { key: 'benefits-report', ...TODAY_NEW_BADGE },
  },
  {
    href: '/business-hub',
    labelKey: 'businessHub',
    icon: Sparkles,
    newBadge: { key: 'zappy-gap-hub', ...TODAY_NEW_BADGE },
  },
  {
    href: '/business-hub/goals',
    labelKey: 'financialGoals',
    icon: Target,
    newBadge: { key: 'financial-goals', ...TODAY_NEW_BADGE },
  },
  { href: '/reports', labelKey: 'reports', icon: BarChart3 },
  { href: '/referrals', labelKey: 'referrals', icon: HeartHandshake },
  {
    href: '/broadcasts',
    labelKey: 'broadcasts',
    icon: Radio,
    newBadge: { key: 'saved-audience-segments', ...TODAY_NEW_BADGE },
  },
  {
    href: '/segments',
    labelKey: 'segments',
    icon: ListFilter,
    newBadge: { key: 'segments-page', ...TODAY_NEW_BADGE },
  },
  {
    href: '/scheduled-messages',
    labelKey: 'scheduledMessages',
    icon: Send,
    newBadge: { key: 'scheduled-whatsapp', ...TODAY_NEW_BADGE },
  },
  {
    href: '/social-planner',
    labelKey: 'socialPlanner',
    icon: Clapperboard,
    newBadge: { key: 'social-planner', ...TODAY_NEW_BADGE },
  },
  {
    href: '/portal-campaigns',
    labelKey: 'portalCampaigns',
    icon: Megaphone,
    newBadge: { key: 'portal-campaigns', ...TODAY_NEW_BADGE },
  },
  {
    href: '/library',
    labelKey: 'library',
    icon: LibraryBig,
    newBadge: { key: 'message-library', ...TODAY_NEW_BADGE },
  },
  { href: '/automations', labelKey: 'automations', icon: Zap },
  { href: '/flows', labelKey: 'flows', icon: Workflow, beta: true },
  { href: '/agents', labelKey: 'aiAgents', icon: Bot },
  { href: '/support', labelKey: 'support', icon: LifeBuoy },
  { href: '/website', labelKey: 'website', icon: Globe2 },
  { href: '/system-health', labelKey: 'systemHealth', icon: Activity },
];

export const bottomNavItems: NavItem[] = [
  { href: '/help', labelKey: 'help', icon: CircleHelp },
  { href: '/settings', labelKey: 'settings', icon: Settings },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  return (
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
  );
}
