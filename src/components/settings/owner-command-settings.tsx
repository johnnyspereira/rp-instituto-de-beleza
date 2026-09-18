'use client';

import { useEffect, useState } from 'react';
import { Loader2, LockKeyhole, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export function OwnerCommandSettings({ canEdit }: { canEdit: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => { void (async () => { try { const response = await fetch('/api/ai/owner-commands'); const data = await response.json(); setEnabled(Boolean(data.enabled)); setPhone(data.authorized_phone ?? ''); } catch { toast.error('Não foi possível carregar os comandos privados.'); } finally { setLoading(false); } })(); }, []);
  async function save() { setSaving(true); try { const response = await fetch('/api/ai/owner-commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, authorized_phone: phone }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? 'Não foi possível guardar.'); toast.success(enabled ? 'Comandos privados ativados.' : 'Comandos privados guardados e desativados.'); } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível guardar.'); } finally { setSaving(false); } }
  if (loading) return <div className="flex items-center gap-2 rounded-2xl border p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A carregar comandos privados…</div>;
  return <section className="rounded-2xl border border-amber-300/60 bg-gradient-to-br from-amber-50 to-background p-5 dark:from-amber-950/15">
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500 text-white"><LockKeyhole className="h-5 w-5" /></span><div><h3 className="font-heading font-semibold">Comandos privados por WhatsApp</h3><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Apenas este número pode pedir bloqueios na Agenda. Cada alteração exige uma mensagem de confirmação e fica registada.</p></div></div><Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canEdit || saving} /></div>
    <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]"><div className="space-y-2"><Label htmlFor="owner-command-phone">O seu número de WhatsApp</Label><Input id="owner-command-phone" value={phone} onChange={(event) => setPhone(event.target.value)} disabled={!canEdit || saving} placeholder="+351935864343" /><p className="text-xs text-muted-foreground">Use o número com indicativo. Fuso aplicado: Europe/Lisbon.</p></div><Button onClick={save} disabled={!canEdit || saving} className="self-end">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Guardar</Button></div>
    <div className="mt-4 flex gap-2 rounded-xl border border-amber-300/50 bg-background/70 px-3 py-2.5 text-xs"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>Exemplo: <strong>Bloquear 10 de setembro de 2026 das 15:00 até às 20:00</strong>. Depois responda ao código de confirmação recebido.</span></div>
  </section>;
}
