'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Inbox,
  Loader2,
  MessageSquare,
  Send,
  SquareCheckBig,
  TriangleAlert,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type ContactRef = {
  id: string;
  name: string | null;
  phone: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  due_at: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'completed' | 'cancelled';
  contact: ContactRef | null;
};

type ScheduledRow = {
  id: string;
  content_text: string;
  scheduled_at: string;
  status: 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
  contact: ContactRef | null;
};

type ConversationRow = {
  id: string;
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number | null;
  contact: ContactRef | null;
};

function normalizeContact(value: unknown): ContactRef | null {
  if (Array.isArray(value)) return normalizeContact(value[0] ?? null);
  if (!value || typeof value !== 'object') return null;
  const contact = value as Partial<ContactRef>;
  return {
    id: String(contact.id ?? ''),
    name: contact.name ?? null,
    phone: contact.phone ?? null,
  };
}

function normalizeTasks(data: unknown): TaskRow[] {
  return Array.isArray(data)
    ? data.map((row) => {
        const item = row as TaskRow & { contact: unknown };
        return { ...item, contact: normalizeContact(item.contact) };
      })
    : [];
}

function normalizeScheduled(data: unknown): ScheduledRow[] {
  return Array.isArray(data)
    ? data.map((row) => {
        const item = row as ScheduledRow & { contact: unknown };
        return { ...item, contact: normalizeContact(item.contact) };
      })
    : [];
}

function normalizeConversations(data: unknown): ConversationRow[] {
  return Array.isArray(data)
    ? data.map((row) => {
        const item = row as ConversationRow & { contact: unknown };
        return { ...item, contact: normalizeContact(item.contact) };
      })
    : [];
}

function formatTime(value: string | null) {
  if (!value) return 'Sem horário';
  return new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function contactName(contact: ContactRef | null) {
  return contact?.name?.trim() || contact?.phone || 'Cliente';
}

function isOverdue(value: string | null) {
  return Boolean(value) && new Date(value as string).getTime() < Date.now();
}

export function FollowUpCommandCenter() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledRow[]>([]);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const db = createClient();
    const now = new Date().toISOString();
    const staleCutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

    const [tasksRes, scheduledRes, conversationsRes] = await Promise.all([
      db
        .from('crm_tasks')
        .select('id,title,due_at,priority,status,contact:contacts(id,name,phone)')
        .eq('status', 'open')
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(8),
      db
        .from('scheduled_whatsapp_messages')
        .select(
          'id,content_text,scheduled_at,status,contact:contacts(id,name,phone)'
        )
        .in('status', ['scheduled', 'sending'])
        .gte('scheduled_at', now)
        .order('scheduled_at', { ascending: true })
        .limit(6),
      db
        .from('conversations')
        .select(
          'id,last_message_text,last_message_at,unread_count,contact:contacts(id,name,phone)'
        )
        .or(`unread_count.gt.0,last_message_at.lt.${staleCutoff}`)
        .order('unread_count', { ascending: false })
        .order('last_message_at', { ascending: true, nullsFirst: false })
        .limit(6),
    ]);

    if (tasksRes.error || scheduledRes.error || conversationsRes.error) {
      setError(true);
    } else {
      setTasks(normalizeTasks(tasksRes.data));
      setScheduled(normalizeScheduled(scheduledRes.data));
      setConversations(normalizeConversations(conversationsRes.data));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Initial remote-data synchronization for this client view.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const overdueTasks = useMemo(
    () => tasks.filter((task) => isOverdue(task.due_at)),
    [tasks]
  );
  const totalAttention =
    overdueTasks.length + scheduled.length + conversations.length;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
            <Inbox className="size-3.5" />
            Central de follow-up
          </div>
          <h2 className="text-foreground text-lg font-semibold">
            O que precisa de atenção agora
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Tarefas, conversas e mensagens programadas num só lugar.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Clock3 />}
            Atualizar
          </Button>
          <Link
            href="/tasks"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 items-center justify-center rounded-lg px-3 text-sm font-medium"
          >
            Abrir tarefas
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 pt-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="bg-muted h-36 animate-pulse rounded-xl"
            />
          ))}
        </div>
      ) : error ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-600">
          <TriangleAlert className="size-4" />
          Dados de follow-up indisponíveis. Confirme as migrations recentes.
        </div>
      ) : totalAttention === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <CheckCircle2 className="size-5 text-emerald-500" />
          <div>
            <p className="text-foreground text-sm font-medium">
              Nada urgente neste momento.
            </p>
            <p className="text-muted-foreground text-xs">
              Sem tarefas atrasadas, conversas críticas ou envios próximos.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 pt-4 lg:grid-cols-3">
          <FollowUpColumn
            title={`Tarefas (${tasks.length})`}
            icon={SquareCheckBig}
            href="/tasks"
            items={tasks.map((task) => ({
              id: task.id,
              title: task.title,
              subtitle: `${contactName(task.contact)} · ${formatTime(task.due_at)}`,
              tone: isOverdue(task.due_at) ? 'danger' : 'default',
            }))}
            empty="Sem tarefas abertas."
          />
          <FollowUpColumn
            title={`Mensagens (${scheduled.length})`}
            icon={Send}
            href="/scheduled-messages"
            items={scheduled.map((message) => ({
              id: message.id,
              title: contactName(message.contact),
              subtitle: `${formatTime(message.scheduled_at)} · ${message.content_text}`,
              tone: 'default',
            }))}
            empty="Sem mensagens próximas."
          />
          <FollowUpColumn
            title={`Conversas (${conversations.length})`}
            icon={MessageSquare}
            href="/inbox"
            items={conversations.map((conversation) => ({
              id: conversation.id,
              title: contactName(conversation.contact),
              subtitle:
                conversation.unread_count && conversation.unread_count > 0
                  ? `${conversation.unread_count} não lida(s)`
                  : `Sem resposta recente · ${formatTime(conversation.last_message_at)}`,
              tone:
                conversation.unread_count && conversation.unread_count > 0
                  ? 'attention'
                  : 'default',
            }))}
            empty="Sem conversas críticas."
          />
        </div>
      )}
    </section>
  );
}

function FollowUpColumn({
  title,
  icon: Icon,
  href,
  items,
  empty,
}: {
  title: string;
  icon: typeof SquareCheckBig;
  href: string;
  items: Array<{
    id: string;
    title: string;
    subtitle: string;
    tone: 'default' | 'attention' | 'danger';
  }>;
  empty: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-foreground flex items-center gap-2 text-sm font-semibold">
          <Icon className="text-primary size-4" />
          {title}
        </h3>
        <Link href={href} className="text-primary text-xs hover:underline">
          Ver
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed border-border py-6 text-center text-xs">
          {empty}
        </p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 4).map((item) => (
            <Link
              key={item.id}
              href={href}
              className={cn(
                'block rounded-lg border p-2.5 text-sm transition-colors hover:bg-muted/60',
                item.tone === 'danger'
                  ? 'border-red-500/30 bg-red-500/5'
                  : item.tone === 'attention'
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-border bg-card'
              )}
            >
              <p className="text-foreground truncate font-medium">
                {item.title}
              </p>
              <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                {item.subtitle}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
