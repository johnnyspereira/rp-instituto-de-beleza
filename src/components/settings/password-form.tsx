'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

const MIN_PASSWORD = 8;

type PasswordField = 'current' | 'next' | 'confirm';

interface PasswordStrength {
  score: number;
  labelKey: 'strengthWeak' | 'strengthFair' | 'strengthGood' | 'strengthStrong';
  length: boolean;
  mixedCase: boolean;
  number: boolean;
  symbol: boolean;
}

function analysePassword(value: string): PasswordStrength {
  const length = value.length >= MIN_PASSWORD;
  const mixedCase = /[a-z]/.test(value) && /[A-Z]/.test(value);
  const number = /\d/.test(value);
  const symbol = /[^A-Za-z0-9]/.test(value);
  const score = [length, mixedCase, number, symbol].filter(Boolean).length;

  return {
    score,
    length,
    mixedCase,
    number,
    symbol,
    labelKey:
      score >= 4
        ? 'strengthStrong'
        : score === 3
          ? 'strengthGood'
          : score === 2
            ? 'strengthFair'
            : 'strengthWeak',
  };
}

export function PasswordForm() {
  const t = useTranslations('Settings.security');
  const { profile } = useAuth();
  const supabase = createClient();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<PasswordField, boolean>>({
    current: false,
    next: false,
    confirm: false,
  });

  const strength = useMemo(() => analysePassword(next), [next]);
  const passwordsMatch = next.length > 0 && next === confirm;
  const sameAsCurrent = current.length > 0 && current === next;
  const canSubmit =
    !saving &&
    Boolean(current) &&
    Boolean(next) &&
    Boolean(confirm) &&
    strength.length &&
    passwordsMatch &&
    !sameAsCurrent;

  const requirements = [
    {
      label: t('passwordReqLength', { min: MIN_PASSWORD }),
      ok: strength.length,
    },
    { label: t('passwordReqMixed'), ok: strength.mixedCase },
    { label: t('passwordReqNumber'), ok: strength.number },
    { label: t('passwordReqSymbol'), ok: strength.symbol },
  ];

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.email) {
      toast.error(t('cannotChangeNoEmail'));
      return;
    }
    if (!strength.length) {
      setFormError(t('passwordTooShort', { min: MIN_PASSWORD }));
      return;
    }
    if (sameAsCurrent) {
      setFormError(t('passwordSameAsCurrent'));
      return;
    }
    if (!passwordsMatch) {
      setFormError(t('passwordMismatch'));
      return;
    }

    setFormError(null);
    setSaving(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: current,
      });
      if (signInError) {
        toast.error(t('currentPasswordIncorrect'));
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: next,
      });
      if (updateError) {
        toast.error(
          t('passwordUpdateFailed', { message: updateError.message })
        );
        return;
      }

      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success(t('passwordUpdated'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  function toggleVisible(field: PasswordField) {
    setVisible((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <KeyRound className="text-primary size-4" />
          {t('passwordTitle')}
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          {t('passwordDesc', { min: MIN_PASSWORD })}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={onSubmit} className="space-y-5">
          <PasswordInput
            id="current-password"
            label={t('currentPassword')}
            value={current}
            visible={visible.current}
            autoComplete="current-password"
            disabled={saving}
            onChange={(value) => {
              setCurrent(value);
              setFormError(null);
            }}
            onToggle={() => toggleVisible('current')}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PasswordInput
              id="new-password"
              label={t('newPassword')}
              value={next}
              visible={visible.next}
              autoComplete="new-password"
              disabled={saving}
              onChange={(value) => {
                setNext(value);
                setFormError(null);
              }}
              onToggle={() => toggleVisible('next')}
            />
            <PasswordInput
              id="confirm-password"
              label={t('confirmPassword')}
              value={confirm}
              visible={visible.confirm}
              autoComplete="new-password"
              disabled={saving}
              onChange={(value) => {
                setConfirm(value);
                setFormError(null);
              }}
              onToggle={() => toggleVisible('confirm')}
            />
          </div>

          <div className="border-border bg-muted/30 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-foreground flex items-center gap-2 text-xs font-medium">
                <ShieldCheck className="text-primary h-3.5 w-3.5" />
                {t('passwordStrength')}
              </span>
              <span className="text-muted-foreground text-xs">
                {t(strength.labelKey)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1">
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
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {requirements.map((item) => (
                <span
                  key={item.label}
                  className={cn(
                    'flex items-center gap-2 text-xs',
                    item.ok ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {item.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <XCircle className="text-muted-foreground h-3.5 w-3.5" />
                  )}
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          {(formError || (confirm && !passwordsMatch) || sameAsCurrent) && (
            <p className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-xs">
              {formError ||
                (sameAsCurrent
                  ? t('passwordSameAsCurrent')
                  : t('passwordMismatch'))}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={!canSubmit}>
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('updating')}
                </>
              ) : (
                t('updatePassword')
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordInput({
  id,
  label,
  value,
  visible,
  autoComplete,
  disabled,
  onChange,
  onToggle,
}: {
  id: string;
  label: string;
  value: string;
  visible: boolean;
  autoComplete: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-foreground">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          disabled={disabled}
          required
          className="pr-10"
        />
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          className="text-muted-foreground hover:text-foreground hover:bg-muted absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md disabled:opacity-50"
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
