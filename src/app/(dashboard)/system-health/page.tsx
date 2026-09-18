'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Check = { id: string; label: string; status: 'ok' | 'warning' | 'error'; detail: string };
type Health = { checkedAt: string; durationMs: number; checks: Check[] };

export default function SystemHealthPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const run = useCallback(async () => {
    setLoading(true); setError(null);
    try { const response = await fetch('/api/system/health', { cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível executar o diagnóstico.'); setHealth(data); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível executar o diagnóstico.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void run(); }, [run]);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-foreground text-2xl font-bold">Diagnóstico do Sistema</h1><p className="text-muted-foreground mt-1 text-sm">Verificação segura e sem envios reais de base de dados, Worker, Portal e alertas.</p></div><Button onClick={() => void run()} disabled={loading}><RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />Executar testes</Button></div>
    {error ? <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card> : null}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{health?.checks.map((check) => { const Icon = check.status === 'ok' ? CheckCircle2 : check.status === 'warning' ? CircleAlert : XCircle; const color = check.status === 'ok' ? 'text-emerald-600' : check.status === 'warning' ? 'text-amber-600' : 'text-destructive'; return <Card key={check.id}><CardHeader className="flex-row items-center gap-2 space-y-0"><Icon className={`size-5 ${color}`} /><CardTitle className="text-base">{check.label}</CardTitle></CardHeader><CardContent><p className="text-muted-foreground text-sm">{check.detail}</p></CardContent></Card>; })}</div>
    {health ? <p className="text-muted-foreground text-xs">Última verificação: {new Date(health.checkedAt).toLocaleString('pt-PT')} · {health.durationMs} ms</p> : null}
  </div>;
}
