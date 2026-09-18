'use client';

import { useEffect, useState, type ComponentType } from 'react';
import {
  CheckCircle2,
  Clock3,
  KeyRound,
  MailCheck,
  ShieldCheck,
  UserRoundCog,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AccountRecoveryCard } from './account-recovery-card';
import { PasswordForm } from './password-form';
import { SessionsCard } from './sessions-card';
import { MfaCard } from './mfa-card';
import { SettingsPanelHead } from './settings-panel-head';

interface SessionSummary {
  expiresAt: string | null;
}

export function SecurityPanel() {
  const t = useTranslations('Settings.security');
  const { user, accountRole } = useAuth();
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(
    null
  );

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSessionSummary({
        expiresAt: data.session?.expires_at
          ? new Date(data.session.expires_at * 1000).toISOString()
          : null,
      });
    });

    return () => {
      mounted = false;
    };
  }, []);

  const emailConfirmed = Boolean(
    user?.email_confirmed_at || user?.confirmed_at
  );
  const lastSignIn = user?.last_sign_in_at
    ? formatDateTime(user.last_sign_in_at)
    : t('never');
  const sessionExpires = sessionSummary?.expiresAt
    ? formatDateTime(sessionSummary.expiresAt)
    : t('unknown');

  return (
    <section className="animate-in fade-in-50 max-w-6xl duration-200">
      <SettingsPanelHead title={t('title')} description={t('description')} />

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SecurityStatusCard
          icon={MailCheck}
          title={t('emailStatus')}
          value={emailConfirmed ? t('confirmed') : t('pending')}
          description={
            emailConfirmed ? t('emailConfirmedDesc') : t('emailPendingDesc')
          }
          tone={emailConfirmed ? 'success' : 'warning'}
        />
        <SecurityStatusCard
          icon={UserRoundCog}
          title={t('accessLevel')}
          value={accountRole ? t(`role.${accountRole}`) : t('unknown')}
          description={t('accessLevelDesc')}
          tone="neutral"
        />
        <SecurityStatusCard
          icon={Clock3}
          title={t('lastLogin')}
          value={lastSignIn}
          description={t('lastLoginDesc')}
          tone="neutral"
        />
        <SecurityStatusCard
          icon={ShieldCheck}
          title={t('currentSession')}
          value={t('active')}
          description={t('sessionExpires', { date: sessionExpires })}
          tone="success"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <PasswordForm />
        <div className="space-y-4">
          <SecurityChecklist emailConfirmed={emailConfirmed} />
          <AccountRecoveryCard />
          <SessionsCard />
          <MfaCard />
        </div>
      </div>
    </section>
  );
}

function SecurityStatusCard({
  icon: Icon,
  title,
  value,
  description,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  value: string;
  description: string;
  tone: 'success' | 'warning' | 'neutral';
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs font-medium">{title}</p>
            <p className="text-foreground mt-1 truncate text-sm font-semibold">
              {value}
            </p>
          </div>
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
              tone === 'success' && 'bg-emerald-500/10 text-emerald-500',
              tone === 'warning' && 'bg-amber-500/10 text-amber-500',
              tone === 'neutral' && 'bg-primary-soft text-primary'
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <p className="text-muted-foreground mt-3 line-clamp-2 text-xs">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}

function SecurityChecklist({ emailConfirmed }: { emailConfirmed: boolean }) {
  const t = useTranslations('Settings.security');
  const items = [
    {
      label: t('checkEmail'),
      done: emailConfirmed,
      status: emailConfirmed ? t('ready') : t('attention'),
    },
    { label: t('checkPassword'), done: true, status: t('ready') },
    { label: t('checkSessions'), done: true, status: t('ready') },
    { label: t('checkRecovery'), done: true, status: t('ready') },
  ];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <KeyRound className="text-primary h-4 w-4" />
          <div>
            <h3 className="text-foreground text-sm font-semibold">
              {t('checklistTitle')}
            </h3>
            <p className="text-muted-foreground text-xs">
              {t('checklistDesc')}
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <div
              key={item.label}
              className="bg-muted/40 flex items-center justify-between gap-3 rounded-md px-3 py-2"
            >
              <span className="text-foreground flex min-w-0 items-center gap-2 text-xs">
                <CheckCircle2
                  className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    item.done ? 'text-emerald-500' : 'text-amber-500'
                  )}
                />
                <span className="truncate">{item.label}</span>
              </span>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {item.status}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
