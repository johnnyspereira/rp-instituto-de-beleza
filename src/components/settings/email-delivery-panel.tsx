'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, Loader2, MailCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type EmailHealth = {
  transport: 'smtp' | 'sendmail';
  sender: string;
  smtpHostConfigured: boolean;
  smtpAuthenticationConfigured: boolean;
  ready: boolean;
  defaultRecipient: string;
};

export function EmailDeliveryPanel() {
  const [health, setHealth] = useState<EmailHealth | null>(null);
  const [recipient, setRecipient] = useState('');
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void fetch('/api/account/email/diagnostics', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as EmailHealth & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error || 'Falha no diagnóstico.');
        setHealth(payload);
        setRecipient(payload.defaultRecipient);
      })
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : 'Falha no diagnóstico.'
        )
      )
      .finally(() => setLoading(false));
  }, []);

  async function sendTest() {
    setTesting(true);
    try {
      const response = await fetch('/api/account/email/diagnostics', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: recipient }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'O teste falhou.');
      toast.success(`Email de teste enviado para ${recipient}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'O teste falhou.');
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailCheck className="text-primary size-4" />
          Entrega de emails
        </CardTitle>
        <CardDescription>
          O portal, a agenda, os packs e os vouchers utilizam esta mesma
          configuração.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        ) : health ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant={health.ready ? 'default' : 'destructive'}>
                {health.ready ? (
                  <CircleCheck className="size-3" />
                ) : (
                  <CircleAlert className="size-3" />
                )}
                {health.ready
                  ? 'Configuração disponível'
                  : 'Configuração incompleta'}
              </Badge>
              <Badge variant="outline">Método: {health.transport}</Badge>
              <Badge variant="outline">Remetente: {health.sender}</Badge>
            </div>
            {!health.smtpHostConfigured && (
              <p className="text-muted-foreground text-sm">
                SMTP não configurado. O servidor tentará usar o serviço Sendmail
                do cPanel.
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="email"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="geral@rp-instituto.example"
              />
              <Button
                onClick={sendTest}
                disabled={testing || !recipient.trim()}
              >
                {testing && <Loader2 className="size-4 animate-spin" />}
                Enviar teste
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
