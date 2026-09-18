'use client';

import { useState } from 'react';
import { BellOff, BellRing, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';

export function NewFeaturesSettings() {
  const { account, isOwner, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const enabled = Boolean(account?.new_feature_badges_enabled);

  async function update(nextEnabled: boolean) {
    if (!isOwner || saving) return;
    setSaving(true);
    try {
      const response = await fetch('/api/account/new-feature-badges', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error || 'Não foi possível guardar a opção.');
      }
      await refreshProfile();
      toast.success(
        nextEnabled
          ? 'Etiquetas de novidades ativadas.'
          : 'Etiquetas de novidades desativadas.'
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível guardar a opção.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border-border bg-card/70 max-w-2xl rounded-2xl border p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-foreground text-lg font-semibold">
            Etiquetas de novidades
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Controla as etiquetas apresentadas na navegação de toda a conta.
            Esta escolha fica guardada na conta e não volta ao limpar cache ou
            cookies.
          </p>
        </div>
      </div>

      <div className="border-border bg-background/45 mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4">
        <div>
          <p className="text-foreground text-sm font-medium">
            {enabled ? 'Etiquetas ativas' : 'Etiquetas desativadas'}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {enabled
              ? 'Os destaques “NOVO” são exibidos a todos os membros.'
              : 'A navegação fica limpa, sem etiquetas promocionais.'}
          </p>
        </div>
        <Button
          type="button"
          variant={enabled ? 'outline' : 'default'}
          disabled={!isOwner || saving}
          onClick={() => void update(!enabled)}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : enabled ? (
            <BellOff className="size-4" />
          ) : (
            <BellRing className="size-4" />
          )}
          {enabled ? 'Desativar todas' : 'Ativar etiquetas'}
        </Button>
      </div>
    </section>
  );
}
