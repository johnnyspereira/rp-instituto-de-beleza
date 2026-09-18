'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
export function MfaCard() {
  const [factor, setFactor] = useState<{ id: string; status: string } | null>(
    null
  );
  const [enroll, setEnroll] = useState<{ id: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    const { data } = await createClient().auth.mfa.listFactors();
    setFactor(data?.totp?.[0] ?? null);
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  async function start() {
    setBusy(true);
    const { data, error } = await createClient().auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'RP Instituto de Beleza CRM',
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setEnroll({ id: data.id, qr: data.totp.qr_code });
  }
  async function verify() {
    if (!enroll) return;
    setBusy(true);
    const client = createClient();
    const challenge = await client.auth.mfa.challenge({ factorId: enroll.id });
    if (challenge.error) {
      setBusy(false);
      return toast.error(challenge.error.message);
    }
    const result = await client.auth.mfa.verify({
      factorId: enroll.id,
      challengeId: challenge.data.id,
      code,
    });
    setBusy(false);
    if (result.error) return toast.error(result.error.message);
    toast.success('Autenticação de dois fatores ativada.');
    setEnroll(null);
    setCode('');
    await load();
  }
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex gap-3">
          <KeyRound className="text-primary size-5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold">
              Autenticação de dois fatores
            </h3>
            <p className="text-muted-foreground mt-1 text-xs">
              Proteja dados clínicos e financeiros com uma aplicação
              autenticadora.
            </p>
            {factor?.status === 'verified' ? (
              <p className="mt-3 text-xs font-medium text-emerald-600">
                Ativa neste utilizador
              </p>
            ) : enroll ? (
              <div className="mt-3 space-y-2">
                <img
                  className="size-40"
                  src={enroll.qr}
                  alt="Código QR para configurar autenticação"
                />
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Código de 6 dígitos"
                />
                <Button onClick={verify} disabled={busy || code.length !== 6}>
                  {busy && <Loader2 className="animate-spin" />}Confirmar e
                  ativar
                </Button>
              </div>
            ) : (
              <Button
                className="mt-3"
                variant="outline"
                onClick={start}
                disabled={busy}
              >
                {busy && <Loader2 className="animate-spin" />}Configurar 2FA
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
