'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Clock3, Laptop, Loader2, LogOut, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface SessionDevice {
  browser: string;
  expiresAt: string | null;
}

export function SessionsCard() {
  const t = useTranslations('Settings.security');
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState<SessionDevice | null>(null);
  const [signingOutGlobal, setSigningOutGlobal] = useState(false);
  const [signingOutLocal, setSigningOutLocal] = useState(false);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setDevice({
        browser:
          typeof navigator === 'undefined'
            ? t('browserUnknown')
            : browserName(navigator.userAgent),
        expiresAt: data.session?.expires_at
          ? new Date(data.session.expires_at * 1000).toISOString()
          : null,
      });
    });
    return () => {
      mounted = false;
    };
  }, [supabase, t]);

  const signOutCurrentDevice = async () => {
    setSigningOutLocal(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) {
        toast.error(t('signOutFailed', { message: error.message }));
        return;
      }
      window.location.href = '/login';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(msg);
    } finally {
      setSigningOutLocal(false);
    }
  };

  const signOutEverywhere = async () => {
    setSigningOutGlobal(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) {
        toast.error(t('signOutFailed', { message: error.message }));
        return;
      }
      window.location.href = '/login';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(msg);
    } finally {
      setSigningOutGlobal(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <LogOut className="text-primary size-4" />
            {t('sessionsTitle')}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {t('sessionsDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="border-border bg-muted/30 rounded-lg border p-3">
            <div className="flex items-start gap-3">
              <span className="bg-primary-soft text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
                <Laptop className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-foreground text-sm font-semibold">
                  {t('currentDevice')}
                </p>
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                  {device?.browser ?? t('browserUnknown')}
                </p>
                <p className="text-muted-foreground mt-2 flex items-center gap-1 text-xs">
                  <Clock3 className="h-3.5 w-3.5" />
                  {t('expiresAt', {
                    date: device?.expiresAt
                      ? formatDateTime(device.expiresAt)
                      : t('unknown'),
                  })}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={signOutCurrentDevice}
              disabled={signingOutLocal || signingOutGlobal}
            >
              {signingOutLocal ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LogOut className="size-4" />
              )}
              {signingOutLocal ? t('signingOut') : t('signOutCurrent')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setOpen(true)}
              disabled={signingOutLocal || signingOutGlobal}
            >
              <ShieldAlert className="size-4" />
              {t('signOutAll')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('signOutConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('signOutConfirmDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={signingOutGlobal}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              onClick={signOutEverywhere}
              disabled={signingOutGlobal}
            >
              {signingOutGlobal ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('signingOut')}
                </>
              ) : (
                t('signOutEverywhere')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function browserName(userAgent: string) {
  if (/Edg\//.test(userAgent)) return 'Microsoft Edge';
  if (/Chrome\//.test(userAgent)) return 'Google Chrome';
  if (/Firefox\//.test(userAgent)) return 'Mozilla Firefox';
  if (/Safari\//.test(userAgent)) return 'Safari';
  return 'Navegador atual';
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
