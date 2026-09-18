'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Filter,
  Inbox,
  LifeBuoy,
  Loader2,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Search,
  Send,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
type Message = {
  id: string;
  body: string;
  author_type: 'staff' | 'client';
  created_at: string;
};
type Ticket = {
  id: string;
  number: number;
  subject: string;
  category: string;
  priority: string;
  status: string;
  source: string;
  contact_id: string | null;
  updated_at: string;
  created_at: string;
  messages?: Message[];
};
const STATUS: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em atendimento',
  waiting_customer: 'Aguardando cliente',
  resolved: 'Resolvido',
  closed: 'Fechado',
};
const statusTone: Record<string, string> = {
  open: 'bg-blue-500/10 text-blue-600',
  in_progress: 'bg-violet-500/10 text-violet-600',
  waiting_customer: 'bg-amber-500/10 text-amber-700',
  resolved: 'bg-emerald-500/10 text-emerald-700',
  closed: 'bg-muted text-muted-foreground',
};
export function SupportCenter() {
  const { accountId, user, canSendMessages } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [createOpen, setCreateOpen] = useState(false),
    [search, setSearch] = useState(''),
    [statusFilter, setStatusFilter] = useState('active'),
    [subject, setSubject] = useState(''),
    [body, setBody] = useState(''),
    [reply, setReply] = useState(''),
    [priority, setPriority] = useState('normal'),
    [category, setCategory] = useState('general');
  const load = useCallback(async () => {
    if (!accountId) return;
    const { data, error } = await createClient()
      .from('support_tickets')
      .select('*,messages:support_ticket_messages(*)')
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false });
    if (error) toast.error(error.message);
    else setTickets((data ?? []) as Ticket[]);
    setLoading(false);
  }, [accountId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const filtered = useMemo(
    () =>
      tickets.filter((t) => {
        const match =
          t.subject.toLowerCase().includes(search.toLowerCase()) ||
          String(t.number).includes(search);
        const state =
          statusFilter === 'all' ||
          (statusFilter === 'active'
            ? !['resolved', 'closed'].includes(t.status)
            : t.status === statusFilter);
        return match && state;
      }),
    [tickets, search, statusFilter]
  );
  const current = tickets.find((t) => t.id === selected);
  const activeCount = tickets.filter(
    (t) => !['resolved', 'closed'].includes(t.status)
  ).length;
  const waitingCount = tickets.filter(
    (t) => t.status === 'waiting_customer'
  ).length;
  const urgentCount = tickets.filter(
    (t) => t.priority === 'urgent' && !['resolved', 'closed'].includes(t.status)
  ).length;
  async function createTicket() {
    if (!accountId || !user || subject.trim().length < 3 || !body.trim())
      return toast.error('Preencha assunto e descrição.');
    const db = createClient(),
      { data, error } = await db
        .from('support_tickets')
        .insert({
          account_id: accountId,
          created_by: user.id,
          subject: subject.trim(),
          category,
          priority,
          source: 'backoffice',
        })
        .select('id')
        .single();
    if (error) return toast.error(error.message);
    const { error: messageError } = await db
      .from('support_ticket_messages')
      .insert({
        ticket_id: data.id,
        account_id: accountId,
        author_type: 'staff',
        author_user_id: user.id,
        body: body.trim(),
      });
    if (messageError) return toast.error(messageError.message);
    setSubject('');
    setBody('');
    setCreateOpen(false);
    setSelected(data.id);
    toast.success('Ticket criado.');
    void load();
  }
  async function sendReply() {
    if (!current || !accountId || !user || !reply.trim()) return;
    const db = createClient(),
      { error } = await db.from('support_ticket_messages').insert({
        ticket_id: current.id,
        account_id: accountId,
        author_type: 'staff',
        author_user_id: user.id,
        body: reply.trim(),
      });
    if (error) return toast.error(error.message);
    await db
      .from('support_tickets')
      .update({
        status: 'waiting_customer',
        updated_at: new Date().toISOString(),
      })
      .eq('id', current.id);
    setReply('');
    void load();
  }
  async function changeStatus(status: string) {
    if (!current) return;
    const { error } = await createClient()
      .from('support_tickets')
      .update({
        status,
        updated_at: new Date().toISOString(),
        resolved_at: status === 'resolved' ? new Date().toISOString() : null,
      })
      .eq('id', current.id);
    if (error) toast.error(error.message);
    else void load();
  }
  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-[1500px] flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-primary text-sm font-medium">
            ATENDIMENTO AO CLIENTE
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Suporte</h1>
          <p className="text-muted-foreground mt-1">
            Organize, responda e acompanhe solicitações num só lugar.
          </p>
        </div>
        <Button disabled={!canSendMessages} onClick={() => setCreateOpen(true)}>
          <Plus />
          Novo ticket
        </Button>
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric icon={Inbox} label="Em aberto" value={activeCount} />
        <Metric icon={Clock3} label="Aguardando cliente" value={waitingCount} />
        <Metric icon={LifeBuoy} label="Urgentes" value={urgentCount} />
        <Metric
          icon={CheckCircle2}
          label="Resolvidos"
          value={tickets.filter((t) => t.status === 'resolved').length}
        />
      </div>
      <div className="bg-card grid min-h-0 flex-1 overflow-hidden rounded-2xl border lg:grid-cols-[390px_1fr]">
        <section className="flex min-h-0 flex-col border-r">
          <div className="space-y-3 border-b p-4">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar ticket..."
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => v && setStatusFilter(v)}
            >
              <SelectTrigger>
                <Filter />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Tickets ativos</SelectItem>
                <SelectItem value="all">Todos os tickets</SelectItem>
                {Object.entries(STATUS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between border-b px-4 py-2">
            <span className="text-muted-foreground text-xs font-medium">
              {filtered.length} TICKETS
            </span>
            <Button variant="ghost" size="icon" onClick={() => void load()}>
              <RefreshCw />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <Loader2 className="mx-auto mt-12 animate-spin" />
            ) : (
              filtered.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={`hover:bg-muted/40 w-full border-b p-4 text-left transition ${selected === t.id ? 'bg-primary/5 border-l-primary border-l-2' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="truncate font-medium">{t.subject}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {new Date(t.updated_at).toLocaleDateString('pt-PT')}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone[t.status]}`}
                    >
                      {STATUS[t.status]}
                    </span>
                    {t.priority === 'urgent' && (
                      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-600">
                        Urgente
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-2 flex items-center gap-1 text-xs">
                    <UserRound className="size-3" />
                    {t.source === 'portal' ? 'Portal do cliente' : 'Equipa'} ·
                    Ticket #{t.number}
                  </p>
                </button>
              ))
            )}
            {!loading && !filtered.length && (
              <div className="text-muted-foreground p-10 text-center text-sm">
                Nenhum ticket encontrado.
              </div>
            )}
          </div>
        </section>
        <section className="min-h-0">
          {current ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
                <div>
                  <p className="text-muted-foreground text-xs">
                    TICKET #{current.number}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">
                    {current.subject}
                  </h2>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Aberto em{' '}
                    {new Date(current.created_at).toLocaleString('pt-PT')} ·{' '}
                    {current.source === 'portal'
                      ? 'Portal do cliente'
                      : 'Backoffice'}
                  </p>
                </div>
                <Select
                  value={current.status}
                  onValueChange={(v) => v && void changeStatus(v)}
                >
                  <SelectTrigger className="w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-muted/20 min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                {[...(current.messages ?? [])]
                  .sort((a, b) => a.created_at.localeCompare(b.created_at))
                  .map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.author_type === 'staff' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[78%] rounded-2xl px-4 py-3 ${m.author_type === 'staff' ? 'bg-primary text-primary-foreground' : 'bg-card border'}`}
                      >
                        <p className="text-sm leading-6 whitespace-pre-wrap">
                          {m.body}
                        </p>
                        <p
                          className={`mt-2 text-[11px] ${m.author_type === 'staff' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
                        >
                          {m.author_type === 'staff' ? 'Equipa' : 'Cliente'} ·{' '}
                          {new Date(m.created_at).toLocaleString('pt-PT')}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
              <div className="border-t p-4">
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Escreva a sua resposta..."
                  className="min-h-20"
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    disabled={!reply.trim()}
                    onClick={() => void sendReply()}
                  >
                    <Send />
                    Enviar resposta
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground flex h-full min-h-96 flex-col items-center justify-center text-center">
              <MessageSquarePlus className="mb-3 size-10 opacity-40" />
              <p className="text-foreground font-medium">Selecione um ticket</p>
              <p className="mt-1 text-sm">
                A conversa e os detalhes aparecerão aqui.
              </p>
            </div>
          )}
        </section>
      </div>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo ticket</DialogTitle>
            <DialogDescription>
              Registe uma solicitação interna ou abra um atendimento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Assunto</Label>
              <Input
                value={subject}
                maxLength={160}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Resumo da solicitação"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria</Label>
                <Select
                  value={category}
                  onValueChange={(v) => v && setCategory(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">Geral</SelectItem>
                    <SelectItem value="technical">Técnico</SelectItem>
                    <SelectItem value="billing">Financeiro</SelectItem>
                    <SelectItem value="suggestion">Sugestão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade</Label>
                <Select
                  value={priority}
                  onValueChange={(v) => v && setPriority(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Inclua contexto, resultado esperado e o que já foi tentado."
                className="min-h-32"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void createTicket()}>
              <Plus />
              Criar ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Inbox;
  label: string;
  value: number;
}) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="flex items-center gap-3">
        <span className="bg-primary/10 text-primary rounded-lg p-2">
          <Icon className="size-4" />
        </span>
        <div>
          <p className="text-xl font-semibold">{value}</p>
          <p className="text-muted-foreground text-xs">{label}</p>
        </div>
      </div>
    </div>
  );
}
