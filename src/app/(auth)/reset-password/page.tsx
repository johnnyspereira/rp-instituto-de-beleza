'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

const MIN_PASSWORD = 8;

function analysePassword(value: string) {
  const length = value.length >= MIN_PASSWORD;
  const mixedCase = /[a-z]/.test(value) && /[A-Z]/.test(value);
  const number = /\d/.test(value);
  const symbol = /[^A-Za-z0-9]/.test(value);
  const score = [length, mixedCase, number, symbol].filter(Boolean).length;
  return { length, mixedCase, number, symbol, score };
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const strength = useMemo(() => analysePassword(password), [password]);
  const passwordsMatch = password.length > 0 && password === confirm;
  const canSubmit =
    !loading && strength.length && passwordsMatch && password.length > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!strength.length) {
      setError(`A senha deve ter pelo menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (!passwordsMatch) {
      setError('A confirmação não coincide com a nova senha.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    toast.success('Senha redefinida com sucesso.');
    router.replace('/settings?tab=security');
  }

  const requirements = [
    { label: `Mínimo de ${MIN_PASSWORD} caracteres`, ok: strength.length },
    { label: 'Letras maiúsculas e minúsculas', ok: strength.mixedCase },
    { label: 'Pelo menos um número', ok: strength.number },
    { label: 'Pelo menos um símbolo', ok: strength.symbol },
  ];

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      <Card className="border-border bg-card w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="bg-primary/10 mb-2 flex h-12 w-12 items-center justify-center rounded-xl">
            <KeyRound className="text-primary h-6 w-6" />
          </div>
          <CardTitle className="text-foreground text-xl">
            Definir nova senha
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Escolha uma senha segura para voltar a acessar o CRM.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div className="border-destructive/20 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <PasswordField
              id="new-password"
              label="Nova senha"
              value={password}
              visible={showPassword}
              onChange={setPassword}
              onToggle={() => setShowPassword((value) => !value)}
            />
            <PasswordField
              id="confirm-password"
              label="Confirmar nova senha"
              value={confirm}
              visible={showConfirm}
              onChange={setConfirm}
              onToggle={() => setShowConfirm((value) => !value)}
            />

            <div className="border-border bg-muted/30 rounded-lg border p-3">
              <div className="text-foreground mb-3 flex items-center gap-2 text-xs font-medium">
                <ShieldCheck className="text-primary h-3.5 w-3.5" />
                Segurança da senha
              </div>
              <div className="grid grid-cols-4 gap-1">
                {[0, 1, 2, 3].map((index) => (
                  <span
                    key={index}
                    className={cn(
                      'bg-muted h-1.5 rounded-full',
                      index < strength.score &&
                        (strength.score >= 4
                          ? 'bg-emerald-500'
                          : strength.score >= 3
                            ? 'bg-blue-500'
                            : strength.score >= 2
                              ? 'bg-amber-500'
                              : 'bg-red-500')
                    )}
                  />
                ))}
              </div>
              <div className="mt-3 space-y-2">
                {requirements.map((item) => (
                  <span
                    key={item.label}
                    className="text-muted-foreground flex items-center gap-2 text-xs"
                  >
                    {item.ok ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" />
                    )}
                    {item.label}
                  </span>
                ))}
              </div>
            </div>

            <Button type="submit" disabled={!canSubmit} className="mt-1 w-full">
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar nova senha'
              )}
            </Button>
          </form>

          <Link
            href="/login"
            className="text-muted-foreground hover:text-foreground mt-6 flex items-center justify-center gap-2 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para entrar
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  visible,
  onChange,
  onToggle,
}: {
  id: string;
  label: string;
  value: string;
  visible: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="new-password"
          required
          className="pr-10"
        />
        <button
          type="button"
          onClick={onToggle}
          className="text-muted-foreground hover:text-foreground hover:bg-muted absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md"
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          title={visible ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
