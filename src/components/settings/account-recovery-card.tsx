'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { LifeBuoy, Loader2, MailCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { getPublicUrl } from '@/lib/public-url';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function AccountRecoveryCard() {
  const t = useTranslations('Settings.security');
  const { profile, user } = useAuth();
  const [sending, setSending] = useState(false);
  const email = profile?.email || user?.email || '';

  async function sendRecoveryLink() {
    if (!email) {
      toast.error(t('recoveryNoEmail'));
      return;
    }

    setSending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getPublicUrl(
        '/auth/callback?next=/reset-password',
        window.location.origin
      ),
    });
    setSending(false);

    if (error) {
      toast.error(t('recoveryFailed', { message: error.message }));
      return;
    }

    toast.success(t('recoverySent'));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <LifeBuoy className="text-primary size-4" />
          {t('recoveryTitle')}
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          {t('recoveryDesc')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="bg-muted/40 rounded-md px-3 py-2 text-xs">
          <div className="text-muted-foreground">{t('recoveryEmail')}</div>
          <div className="text-foreground mt-0.5 truncate font-medium">
            {email || t('unknown')}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={sendRecoveryLink}
          disabled={sending || !email}
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MailCheck className="size-4" />
          )}
          {sending ? t('sendingRecovery') : t('sendRecoveryLink')}
        </Button>
      </CardContent>
    </Card>
  );
}
