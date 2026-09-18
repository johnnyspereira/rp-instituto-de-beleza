'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  ChevronRight,
  Clock3,
  LifeBuoy,
  Loader2,
  MessageSquarePlus,
  Plus,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
type Ticket = {
  id: string;
  number: number;
  subject: string;
  status: string;
  updated_at: string;
  created_at: string;
  messages: {
    id: string;
    body: string;
    author_type: 'staff' | 'client';
    created_at: string;
  }[];
};
const labels: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em atendimento',
  waiting_customer: 'Aguardando a sua resposta',
  resolved: 'Resolvido',
  closed: 'Fechado',
};
const tones: Record<string, string> = {
  open: 'bg-blue-500/10 text-blue-600',
  in_progress: 'bg-violet-500/10 text-violet-600',
  waiting_customer: 'bg-amber-500/10 text-amber-700',
  resolved: 'bg-emerald-500/10 text-emerald-700',
  closed: 'bg-muted text-muted-foreground',
};
export function PortalSupport({
  slug,
  createInitially = false,
}: {
  slug: string;
  createInitially?: boolean;
}) {
  const [tickets, setTickets] = useState<Ticket[]>([]),
    [active, setActive] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [createOpen, setCreateOpen] = useState(createInitially),
    [subject, setSubject] = useState(''),
    [message, setMessage] = useState(''),
    [reply, setReply] = useState('');
  const load = useCallback(async () => {
    const response = await fetch(
      `/api/portal/${encodeURIComponent(slug)}/support`
    );
    const payload = await response.json();
    if (response.ok) setTickets(payload.tickets);
    else toast.error(payload.error);
    setLoading(false);
  }, [slug]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const current = tickets.find((t) => t.id === active);
  async function send(ticketId?: string) {
    const text = ticketId ? reply : message;
    if (!text.trim() || (!ticketId && subject.trim().length < 3))
      return toast.error('Preencha o assunto e a mensagem.');
    const response = await fetch(
      `/api/portal/${encodeURIComponent(slug)}/support`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, subject, message: text }),
      }
    );
    const payload = await response.json();
    if (!response.ok) return toast.error(payload.error);
    setSubject('');
    setMessage('');
    setReply('');
    setCreateOpen(false);
    setActive(payload.ticketId);
    toast.success(ticketId ? 'Resposta enviada.' : 'Pedido enviado.');
    void load();
  }
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-primary text-sm font-medium">ATENDIMENTO</p>
          <h1 className="mt-1 text-2xl font-semibold">Meus pedidos</h1>
          <p className="text-muted-foreground mt-1">
            Acompanhe as conversas com a nossa equipa.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          Novo pedido
        </Button>
      </header>
      {loading ? (
        <Loader2 className="mx-auto mt-16 animate-spin" />
      ) : tickets.length === 0 ? (
        <div className="bg-background rounded-2xl border border-dashed py-16 text-center">
          <span className="bg-primary/10 text-primary mx-auto flex size-14 items-center justify-center rounded-full">
            <LifeBuoy />
          </span>
          <h2 className="mt-4 text-lg font-semibold">
            Ainda não existem pedidos
          </h2>
          <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm">
            Quando precisar, fale connosco. A conversa ficará guardada aqui.
          </p>
          <Button className="mt-5" onClick={() => setCreateOpen(true)}>
            <MessageSquarePlus />
            Falar com a equipa
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <div className="space-y-3">
            {tickets.map((t) => (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={`bg-background hover:border-primary/30 w-full rounded-xl border p-4 text-left transition ${active === t.id ? 'border-primary shadow-sm' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{t.subject}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Pedido #{t.number}
                    </p>
                  </div>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${tones[t.status]}`}
                  >
                    {labels[t.status]}
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <Clock3 className="size-3" />
                    {new Date(t.updated_at).toLocaleDateString('pt-PT')}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className="bg-background min-h-[420px] rounded-2xl border">
            {current ? (
              <div className="flex h-full min-h-[420px] flex-col">
                <div className="border-b p-5">
                  <p className="text-muted-foreground text-xs">
                    PEDIDO #{current.number}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">
                    {current.subject}
                  </h2>
                  <span
                    className={`mt-2 inline-block rounded-full px-2 py-1 text-[11px] font-medium ${tones[current.status]}`}
                  >
                    {labels[current.status]}
                  </span>
                </div>
                <div className="bg-muted/20 flex-1 space-y-4 p-5">
                  {[...(current.messages || [])]
                    .sort((a, b) => a.created_at.localeCompare(b.created_at))
                    .map((m) => (
                      <div
                        key={m.id}
                        className={`flex ${m.author_type === 'client' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[82%] rounded-2xl px-4 py-3 ${m.author_type === 'client' ? 'bg-primary text-primary-foreground' : 'bg-background border'}`}
                        >
                          <p className="text-sm leading-6 whitespace-pre-wrap">
                            {m.body}
                          </p>
                          <p
                            className={`mt-2 text-[11px] ${m.author_type === 'client' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
                          >
                            {m.author_type === 'client' ? 'Você' : 'Equipa'} ·{' '}
                            {new Date(m.created_at).toLocaleString('pt-PT')}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
                {!['resolved', 'closed'].includes(current.status) && (
                  <div className="border-t p-4">
                    <Textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Escreva uma resposta..."
                    />
                    <div className="mt-2 flex justify-end">
                      <Button
                        disabled={!reply.trim()}
                        onClick={() => void send(current.id)}
                      >
                        <Send />
                        Responder
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-muted-foreground flex min-h-[420px] flex-col items-center justify-center">
                <MessageSquarePlus className="mb-3 size-9 opacity-40" />
                <p className="text-foreground font-medium">
                  Selecione um pedido
                </p>
                <p className="mt-1 text-sm">A conversa aparecerá aqui.</p>
              </div>
            )}
          </div>
        </div>
      )}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Como podemos ajudar?</DialogTitle>
            <DialogDescription>
              Descreva a sua dúvida ou problema. A resposta ficará disponível em
              Meus pedidos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Assunto</Label>
              <Input
                value={subject}
                maxLength={160}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex.: Dúvida sobre a minha marcação"
              />
            </div>
            <div>
              <Label>Mensagem</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Conte-nos o que aconteceu e como podemos ajudar."
                className="min-h-36"
              />
            </div>
            <div className="bg-muted text-muted-foreground rounded-lg p-3 text-xs">
              Não envie palavras-passe ou dados bancários nesta mensagem.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void send()}>
              <Send />
              Enviar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
