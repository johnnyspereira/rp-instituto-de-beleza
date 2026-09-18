'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/hooks/use-auth';
import { resolveSection } from '@/components/settings/settings-sections';

const ROUTE_TITLE_KEYS: Array<[string, string]> = [
  ['/dashboard', 'dashboard'],
  ['/inbox', 'inbox'],
  ['/notifications', 'notifications'],
  ['/agenda', 'agenda'],
  ['/contacts', 'contacts'],
  ['/finance', 'finance'],
  ['/benefits', 'benefits'],
  ['/reports', 'reports'],
  ['/referrals', 'referrals'],
  ['/pipelines', 'pipelines'],
  ['/broadcasts', 'broadcasts'],
  ['/social-planner', 'socialPlanner'],
  ['/portal-campaigns', 'portalCampaigns'],
  ['/automations', 'automations'],
  ['/flows', 'flows'],
  ['/agents', 'aiAgents'],
];

function routeTitleKey(pathname: string) {
  return ROUTE_TITLE_KEYS.find(
    ([path]) => pathname === path || pathname.startsWith(`${path}/`)
  )?.[1];
}

export function DocumentTitle() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { account } = useAuth();
  const tHeader = useTranslations('Header');
  const tSettings = useTranslations('Settings.sections');

  useEffect(() => {
    const brand = account?.name?.trim() || 'CRM';

    if (pathname === '/settings' || pathname.startsWith('/settings/')) {
      const section = resolveSection(searchParams.get('tab'));
      document.title = `${tSettings(section)} · ${tHeader('settings')} · ${brand}`;
      return;
    }

    const key = routeTitleKey(pathname);
    document.title = key ? `${tHeader(key)} · ${brand}` : brand;
  }, [account?.name, pathname, searchParams, tHeader, tSettings]);

  return null;
}
