'use client';

import { useEffect, useState } from 'react';
import { Activity, Bot, BrainCircuit, FlaskConical, Languages, Settings2, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AiPlayground } from '@/components/agents/ai-playground';
import { AiUsageCard } from '@/components/agents/ai-usage';
import { AiConfig } from '@/components/settings/ai-config';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';

type Tab = 'playground' | 'setup' | 'usage';
type AiStatus = { configured: boolean; provider?: string; model?: string; is_active?: boolean; auto_reply_enabled?: boolean };

const providerNames: Record<string, string> = { openai: 'OpenAI', anthropic: 'Claude', gemini: 'Google Gemini', ollama: 'Ollama local' };

export default function AgentsPage() {
  const { accountRole } = useAuth();
  const canViewUsage = accountRole ? canEditSettings(accountRole) : false;
  const [tab, setTab] = useState<Tab>('playground');
  const [decided, setDecided] = useState(false);
  const [status, setStatus] = useState<AiStatus>({ configured: false });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/ai/config');
        const data = await response.json().catch(() => ({}));
        if (!cancelled) {
          setStatus(data ?? { configured: false });
          setTab(data?.configured ? 'playground' : 'setup');
        }
      } catch {
        if (!cancelled) setTab('setup');
      } finally {
        if (!cancelled) setDecided(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const providerName = status.provider ? providerNames[status.provider] ?? status.provider : 'Ainda não configurado';
  const automated = Boolean(status.is_active && status.auto_reply_enabled);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-3xl border border-violet-200/70 bg-gradient-to-br from-violet-950 via-violet-800 to-fuchsia-700 px-6 py-7 text-white shadow-xl shadow-violet-950/10 md:px-8 md:py-9">
        <div className="absolute -top-20 -right-12 h-56 w-56 rounded-full bg-fuchsia-300/20 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-cyan-300/15 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-violet-100"><BrainCircuit className="h-3.5 w-3.5" /> CENTRAL DE INTELIGÊNCIA</div>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Agente que atende com o seu contexto</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-violet-100 md:text-base">Configure a IA, teste respostas com segurança e só depois ative automações para a sua equipa.</p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-slate-950/20 px-4 py-3 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-sm font-semibold"><span className={`h-2.5 w-2.5 rounded-full ${status.configured ? 'bg-emerald-300' : 'bg-amber-300'}`} />{status.configured ? 'Ligação configurada' : 'Configuração pendente'}</div>
            <p className="mt-1 text-xs text-violet-100">{providerName}{status.model ? ` · ${status.model}` : ''}</p>
          </div>
        </div>
      </section>

      {decided && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard icon={ShieldCheck} label="Fornecedor" value={providerName} tone="violet" />
        <StatusCard icon={Zap} label="Respostas automáticas" value={automated ? 'Ativadas' : 'Desativadas'} tone={automated ? 'emerald' : 'slate'} />
        <StatusCard icon={Languages} label="Tradução no Inbox" value="Sempre com revisão" tone="sky" />
        <StatusCard icon={Activity} label="Modo de segurança" value="Teste antes de enviar" tone="amber" />
      </div>}

      {decided && <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="gap-5">
        <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center md:justify-between">
          <div><h2 className="text-lg font-semibold">Espaço de trabalho do agente</h2><p className="text-muted-foreground text-sm">Uma configuração clara, sem expor chaves nem ativar respostas por engano.</p></div>
          <TabsList className="h-auto w-full justify-start gap-1 rounded-xl p-1 md:w-auto">
            <TabsTrigger value="playground" className="h-9 px-3"><FlaskConical /> Testar</TabsTrigger>
            <TabsTrigger value="setup" className="h-9 px-3"><Settings2 /> Configurar</TabsTrigger>
            {canViewUsage && <TabsTrigger value="usage" className="h-9 px-3"><Sparkles /> Uso</TabsTrigger>}
          </TabsList>
        </div>
        <TabsContent value="playground" className="mt-0"><AiPlayground onGoToSetup={() => setTab('setup')} /></TabsContent>
        <TabsContent value="setup" className="mt-0"><AiConfig /></TabsContent>
        {canViewUsage && <TabsContent value="usage" className="mt-0"><AiUsageCard /></TabsContent>}
      </Tabs>}
    </div>
  );
}

function StatusCard({ icon: Icon, label, value, tone }: { icon: typeof Bot; label: string; value: string; tone: 'violet' | 'emerald' | 'sky' | 'amber' | 'slate' }) {
  const tones = { violet: 'bg-violet-500/10 text-violet-600', emerald: 'bg-emerald-500/10 text-emerald-600', sky: 'bg-sky-500/10 text-sky-600', amber: 'bg-amber-500/10 text-amber-600', slate: 'bg-slate-500/10 text-slate-600' };
  return <div className="rounded-2xl border bg-card p-4 shadow-sm"><div className="flex items-center gap-3"><span className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="text-muted-foreground text-xs font-medium">{label}</p><p className="truncate text-sm font-semibold">{value}</p></div></div></div>;
}
