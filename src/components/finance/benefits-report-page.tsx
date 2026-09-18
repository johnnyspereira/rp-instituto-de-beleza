'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CalendarClock, CheckCircle2, Gift, Inbox, Loader2, Mail, PackageCheck, RefreshCw, Search, Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { FinanceClientPack, FinanceVoucher } from '@/types';

type Delivery = { id: string; type: string; title: string; body: string; created_at: string };
const money = (value: number, currency = 'EUR') => new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format(value);
const labels: Record<string, string> = { active: 'Ativo', pending: 'Pendente', used: 'Utilizado', expired: 'Expirado', cancelled: 'Cancelado', exhausted: 'Esgotado' };
const date = (value?: string | null) => value ? new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium' }).format(new Date(value)) : 'Sem validade';

export function BenefitsReportPage() {
  const db = useMemo(() => createClient(), []);
  const { accountId, user } = useAuth();
  const [packs, setPacks] = useState<FinanceClientPack[]>([]);
  const [vouchers, setVouchers] = useState<FinanceVoucher[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sendingSaleId, setSendingSaleId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accountId || !user?.id) return;
    setLoading(true);
    const [packResult, voucherResult, deliveryResult] = await Promise.all([
      db.from('finance_client_packs').select('*, contact:contacts(*), pack:finance_pack_catalog(*), balances:finance_client_pack_balances(*, service:clinic_services(*))').eq('account_id', accountId).order('purchased_at', { ascending: false }),
      db.from('finance_vouchers').select('*, owner:contacts(*), service:clinic_services(*)').eq('account_id', accountId).order('created_at', { ascending: false }),
      db.from('notifications').select('id,type,title,body,created_at').eq('account_id', accountId).eq('user_id', user.id).in('type', ['pack_delivery_sent', 'pack_delivery_failed', 'voucher_delivery_sent', 'voucher_delivery_failed']).order('created_at', { ascending: false }).limit(100),
    ]);
    const error = packResult.error || voucherResult.error || deliveryResult.error;
    if (error) toast.error(`Falha ao carregar benefícios: ${error.message}`);
    else { setPacks((packResult.data ?? []) as FinanceClientPack[]); setVouchers((voucherResult.data ?? []) as FinanceVoucher[]); setDeliveries((deliveryResult.data ?? []) as Delivery[]); }
    setLoading(false);
  }, [accountId, db, user?.id]);
  useEffect(() => { void load(); }, [load]);

  async function resendVoucher(voucher: FinanceVoucher) {
    if (!voucher.issued_sale_id) return toast.error('Este voucher não está associado a uma venda.');
    if (!voucher.owner?.email) return toast.error('O cliente não tem email registado.');
    setSendingSaleId(voucher.issued_sale_id);
    try {
      const response = await fetch('/api/finance/vouchers/deliver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saleId: voucher.issued_sale_id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar o voucher.');
      if (result.sent) toast.success(`Voucher enviado para ${voucher.owner.email} com PDF anexo.`);
      else toast.error(result.failures?.[0] || 'O voucher não foi enviado. Confirme o email do cliente.');
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Falha ao reenviar voucher.'); }
    finally { setSendingSaleId(null); }
  }

  const term = search.trim().toLowerCase();
  const matches = (values: Array<string | null | undefined>) => !term || values.some((value) => value?.toLowerCase().includes(term));
  const filteredPacks = packs.filter((item) => matches([item.contact?.name, item.contact?.email, item.contact?.phone, item.pack?.name, item.code]));
  const filteredVouchers = vouchers.filter((item) => matches([item.owner?.name, item.owner?.email, item.owner?.phone, item.code, item.recipient_name]));
  const activePacks = packs.filter((item) => item.status === 'active');
  const sessions = activePacks.reduce((sum, item) => sum + (item.balances ?? []).reduce((total, balance) => total + Number(balance.remaining_sessions), 0), 0);
  const activeVouchers = vouchers.filter((item) => item.status === 'active');
  const balance = activeVouchers.reduce((sum, item) => sum + Number(item.current_balance || 0), 0);

  return <main className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
    <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-violet-700 via-primary to-fuchsia-600 px-6 py-7 text-white shadow-xl md:px-8"><div className="absolute -top-16 right-8 size-56 rounded-full bg-white/10 blur-2xl" /><div className="relative flex flex-wrap items-end justify-between gap-5"><div className="max-w-2xl"><div className="mb-3 flex items-center gap-2 text-sm font-medium text-white/80"><Sparkles className="size-4" /> Centro de benefícios</div><h1 className="text-3xl font-bold tracking-tight md:text-4xl">Tudo o que o cliente pode usar, num só lugar.</h1><p className="mt-3 text-sm leading-6 text-white/80 md:text-base">Acompanhe packs, vouchers, saldo e entregas. Reenvie o voucher em PDF sem criar uma nova venda.</p></div><div className="flex gap-2"><Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw className={cn(loading && 'animate-spin')} /> Atualizar</Button><Link className={cn(buttonVariants({ variant: 'outline' }), 'border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white')} href="/finance?tab=pos">Abrir POS <ArrowUpRight /></Link></div></div></section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={PackageCheck} tone="emerald" label="Packs utilizáveis" value={activePacks.length} detail={`${sessions} sessões disponíveis`} /><Metric icon={Gift} tone="violet" label="Vouchers ativos" value={activeVouchers.length} detail={balance ? `${money(balance)} em saldo` : 'Prontos a utilizar'} /><Metric icon={Mail} tone="sky" label="Entregas registadas" value={deliveries.filter((item) => item.type.endsWith('_sent')).length} detail="Envios de email concluídos" /><Metric icon={CalendarClock} tone="amber" label="A acompanhar" value={packs.filter((item) => item.status === 'pending').length + vouchers.filter((item) => item.status === 'pending').length} detail="Benefícios ainda pendentes" /></section>
    <section className="rounded-2xl border bg-card p-3 shadow-sm md:p-4"><div className="relative max-w-2xl"><Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" /><Input className="h-11 rounded-xl pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar por cliente, email, telefone, voucher ou código..." /></div></section>
    <Tabs defaultValue="vouchers" className="space-y-4"><TabsList className="h-auto rounded-xl p-1"><TabsTrigger className="rounded-lg px-4" value="vouchers">Vouchers <Badge variant="secondary">{filteredVouchers.length}</Badge></TabsTrigger><TabsTrigger className="rounded-lg px-4" value="packs">Packs <Badge variant="secondary">{filteredPacks.length}</Badge></TabsTrigger><TabsTrigger className="rounded-lg px-4" value="deliveries">Histórico <Badge variant="secondary">{deliveries.length}</Badge></TabsTrigger></TabsList>
      <TabsContent value="vouchers" className="mt-0 grid gap-4 lg:grid-cols-2">{filteredVouchers.map((voucher) => <VoucherCard key={voucher.id} voucher={voucher} sending={sendingSaleId === voucher.issued_sale_id} onResend={() => void resendVoucher(voucher)} />)}{!filteredVouchers.length && <Empty icon={Gift} text="Nenhum voucher encontrado." />}</TabsContent>
      <TabsContent value="packs" className="mt-0 grid gap-4 lg:grid-cols-2">{filteredPacks.map((pack) => <PackCard key={pack.id} pack={pack} />)}{!filteredPacks.length && <Empty icon={PackageCheck} text="Nenhum pack encontrado." />}</TabsContent>
      <TabsContent value="deliveries" className="mt-0 space-y-3">{deliveries.map((item) => <Card key={item.id} className="gap-0"><CardContent className="flex items-start gap-3 p-4"><div className={cn('rounded-xl p-2', item.type.endsWith('_failed') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600')}>{item.type.endsWith('_failed') ? <Inbox className="size-5" /> : <CheckCircle2 className="size-5" />}</div><div className="min-w-0 flex-1"><p className="font-semibold">{item.title}</p><p className="text-muted-foreground mt-1 text-sm">{item.body}</p></div><time className="text-muted-foreground text-xs">{new Date(item.created_at).toLocaleString('pt-PT')}</time></CardContent></Card>)}{!deliveries.length && <Empty icon={Mail} text="Ainda não há entregas registadas." />}</TabsContent>
    </Tabs>
  </main>;
}

function Metric({ icon: Icon, label, value, detail, tone }: { icon: typeof Gift; label: string; value: number; detail: string; tone: 'emerald' | 'violet' | 'sky' | 'amber' }) { const colors = { emerald: 'bg-emerald-100 text-emerald-700', violet: 'bg-violet-100 text-violet-700', sky: 'bg-sky-100 text-sky-700', amber: 'bg-amber-100 text-amber-700' }; return <Card className="gap-0"><CardContent className="flex items-center gap-4 p-5"><div className={cn('rounded-2xl p-3', colors[tone])}><Icon className="size-5" /></div><div><p className="text-muted-foreground text-sm">{label}</p><p className="mt-0.5 text-2xl font-bold">{value}</p><p className="text-muted-foreground text-xs">{detail}</p></div></CardContent></Card>; }
function Status({ value }: { value: string }) { return <Badge variant={value === 'active' ? 'default' : value === 'expired' || value === 'cancelled' ? 'destructive' : 'secondary'}>{labels[value] || value}</Badge>; }
function VoucherCard({ voucher, sending, onResend }: { voucher: FinanceVoucher; sending: boolean; onResend: () => void }) { const service = voucher.voucher_type === 'service'; const email = voucher.owner?.email; return <Card className="gap-0 overflow-hidden"><div className="h-1.5 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400" /><CardContent className="space-y-5 p-5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><div className="rounded-2xl bg-violet-100 p-3 text-violet-700"><Gift className="size-5" /></div><div className="min-w-0"><p className="font-semibold">{voucher.recipient_name || voucher.owner?.name || 'Destinatário não definido'}</p><p className="text-muted-foreground truncate text-sm">{voucher.service?.name || (service ? 'Voucher de serviço' : 'Voucher de valor')}</p></div></div><Status value={voucher.status} /></div><div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/60 p-3"><div><p className="text-muted-foreground text-xs">{service ? 'Sessões disponíveis' : 'Saldo disponível'}</p><p className="mt-1 font-semibold">{service ? `${Number(voucher.remaining_uses ?? 0)} sessão` : money(Number(voucher.current_balance), voucher.currency)}</p></div><div><p className="text-muted-foreground text-xs">Validade</p><p className="mt-1 font-semibold">{date(voucher.expires_at)}</p></div></div><div className="flex flex-wrap items-center justify-between gap-2"><code className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs font-bold tracking-wide text-violet-800">{voucher.code} · PIN {voucher.pin_code || '—'}</code><div className="flex gap-2"><Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={voucher.owner_contact_id ? `/contacts/${voucher.owner_contact_id}` : '/contacts'}>Cliente</Link><Button size="sm" onClick={onResend} disabled={!voucher.issued_sale_id || !email || sending} title={!email ? 'O cliente precisa de ter email registado.' : undefined}>{sending ? <Loader2 className="animate-spin" /> : <Send />} Reenviar PDF</Button></div></div>{!email && <p className="text-xs text-amber-700">Adicione um email ao cliente para poder reenviar este voucher.</p>}</CardContent></Card>; }
function PackCard({ pack }: { pack: FinanceClientPack }) { const total = (pack.balances ?? []).reduce((sum, item) => sum + Number(item.total_sessions), 0); const remaining = (pack.balances ?? []).reduce((sum, item) => sum + Number(item.remaining_sessions), 0); const percentage = total ? Math.round((remaining / total) * 100) : 0; return <Card className="gap-0 overflow-hidden"><div className="h-1.5 bg-gradient-to-r from-emerald-500 to-cyan-500" /><CardContent className="space-y-5 p-5"><div className="flex justify-between gap-3"><div className="flex gap-3"><div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700"><PackageCheck className="size-5" /></div><div><p className="font-semibold">{pack.contact?.name || 'Cliente sem nome'}</p><p className="text-muted-foreground text-sm">{pack.pack?.name || 'Pack'}</p></div></div><Status value={pack.status} /></div><div><div className="mb-2 flex justify-between text-sm"><span className="text-muted-foreground">Sessões restantes</span><strong>{remaining} de {total}</strong></div><div className="h-2 overflow-hidden rounded-full bg-emerald-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${percentage}%` }} /></div></div><div className="flex items-center justify-between"><code className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-800">{pack.code || 'Sem código'} · PIN {pack.pin_code || '—'}</code><Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={pack.contact_id ? `/contacts/${pack.contact_id}` : '/contacts'}>Ver cliente</Link></div></CardContent></Card>; }
function Empty({ icon: Icon, text }: { icon: typeof Gift; text: string }) { return <div className="col-span-full rounded-2xl border border-dashed p-12 text-center"><div className="mx-auto mb-3 w-fit rounded-2xl bg-muted p-3 text-muted-foreground"><Icon className="size-6" /></div><p className="font-medium">{text}</p><p className="text-muted-foreground mt-1 text-sm">Use a pesquisa ou crie uma nova venda no POS.</p></div>; }
