'use client';

import {
  CheckCircle2,
  Crown,
  Info,
  LockKeyhole,
  Shield,
  UserCog,
  UserIcon,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AccountRole } from '@/lib/auth/roles';

import { ROLE_META } from './role-meta';
import { SettingsPanelHead } from './settings-panel-head';
import type { SettingsSection } from './settings-sections';

const ROLE_ORDER: AccountRole[] = ['owner', 'admin', 'agent', 'viewer'];

const ROLE_ICONS: Record<AccountRole, LucideIcon> = {
  owner: Crown,
  admin: Shield,
  agent: UserCog,
  viewer: UserIcon,
};

const CAPABILITIES: {
  key: string;
  roles: readonly AccountRole[];
}[] = [
  {
    key: 'workspaceSettings',
    roles: ['owner', 'admin'],
  },
  {
    key: 'members',
    roles: ['owner', 'admin'],
  },
  {
    key: 'whatsapp',
    roles: ['owner', 'admin'],
  },
  {
    key: 'crmWrite',
    roles: ['owner', 'admin', 'agent'],
  },
  {
    key: 'sendMessages',
    roles: ['owner', 'admin', 'agent'],
  },
  {
    key: 'automations',
    roles: ['owner', 'admin', 'agent'],
  },
  {
    key: 'readOnly',
    roles: ['viewer'],
  },
  {
    key: 'apiKeys',
    roles: ['owner', 'admin'],
  },
  {
    key: 'ownership',
    roles: ['owner'],
  },
];

interface RolesAccessPanelProps {
  onSelect: (section: SettingsSection) => void;
}

export function RolesAccessPanel({ onSelect }: RolesAccessPanelProps) {
  const t = useTranslations('Settings.access');
  const tRoles = useTranslations('Settings.roles');

  return (
    <section className="animate-in fade-in-50 space-y-5 duration-200">
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
        action={
          <Button onClick={() => onSelect('members')}>
            <UserCog className="size-4" />
            {t('manageMembers')}
          </Button>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {ROLE_ORDER.map((role) => {
          const Icon = ROLE_ICONS[role];
          const meta = ROLE_META[role];
          return (
            <Card key={role} className="rounded-lg">
              <CardHeader className="space-y-2">
                <div
                  className={cn(
                    'flex size-9 items-center justify-center rounded-md border',
                    meta.className
                  )}
                >
                  <Icon className="size-4" />
                </div>
                <div>
                  <CardTitle className="text-sm">{tRoles(role)}</CardTitle>
                  <CardDescription className="text-xs">
                    {t(`roleCards.${role}`)}
                  </CardDescription>
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LockKeyhole className="text-primary size-4" />
            {t('matrixTitle')}
          </CardTitle>
          <CardDescription>{t('matrixDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-border bg-muted/40 border-y">
                  <th className="text-muted-foreground px-4 py-3 text-left text-xs font-semibold">
                    {t('capability')}
                  </th>
                  {ROLE_ORDER.map((role) => (
                    <th
                      key={role}
                      className="text-muted-foreground px-4 py-3 text-center text-xs font-semibold"
                    >
                      {tRoles(role)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CAPABILITIES.map((capability) => (
                  <tr
                    key={capability.key}
                    className="border-border border-b last:border-b-0"
                  >
                    <td className="px-4 py-3">
                      <div className="text-foreground font-medium">
                        {t(`capabilities.${capability.key}.title`)}
                      </div>
                      <div className="text-muted-foreground mt-0.5 text-xs">
                        {t(`capabilities.${capability.key}.desc`)}
                      </div>
                    </td>
                    {ROLE_ORDER.map((role) => {
                      const allowed = capability.roles.includes(role);
                      return (
                        <td key={role} className="px-4 py-3 text-center">
                          {allowed ? (
                            <CheckCircle2 className="text-primary mx-auto size-4" />
                          ) : (
                            <XCircle className="text-muted-foreground/45 mx-auto size-4" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="rounded-lg lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="text-primary size-4" />
              {t('rulesTitle')}
            </CardTitle>
            <CardDescription>{t('rulesDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {['viewer', 'agent', 'admin', 'owner'].map((key) => (
                <div
                  key={key}
                  className="border-border bg-muted/20 rounded-md border p-3"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant="outline">{tRoles(key)}</Badge>
                  </div>
                  <p className="text-muted-foreground text-xs leading-5">
                    {t(`rules.${key}`)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>{t('recommendedTitle')}</CardTitle>
            <CardDescription>{t('recommendedDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {['owner', 'admin', 'agent', 'viewer'].map((key) => (
              <div
                key={key}
                className="bg-muted/30 flex items-start justify-between gap-3 rounded-md px-3 py-2"
              >
                <span className="text-foreground font-medium">
                  {tRoles(key)}
                </span>
                <span className="text-muted-foreground text-right text-xs">
                  {t(`recommended.${key}`)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
