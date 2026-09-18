'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { ContactSearchSelect } from '@/components/contacts/contact-search-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { createClient } from '@/lib/supabase/client';
import type { Contact } from '@/types';

type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
type TaskStatus = 'open' | 'completed' | 'cancelled';

type CrmTask = {
  id: string;
  account_id: string;
  user_id: string | null;
  contact_id: string | null;
  title: string;
  description: string | null;
  due_at: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  contact?: Pick<Contact, 'id' | 'name' | 'phone' | 'email'> | null;
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

const PRIORITY_CLASSES: Record<TaskPriority, string> = {
  low: 'border-muted bg-muted text-muted-foreground',
  normal: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  high: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  urgent: 'border-red-500/30 bg-red-500/10 text-red-400',
};

function datetimeLocalValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatDateTime(value: string | null) {
  if (!value) return 'Sem data';
  return new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function contactLabel(contact: CrmTask['contact']) {
  if (!contact) return 'Sem cliente associado';
  return contact.name?.trim() || contact.phone || 'Cliente sem nome';
}

function isOverdue(task: CrmTask) {
  return (
    task.status === 'open' &&
    Boolean(task.due_at) &&
    new Date(task.due_at as string).getTime() < Date.now()
  );
}

export function TasksPage() {
  const supabase = useMemo(() => createClient(), []);
  const { accountId, user } = useAuth();
  const canOperate = useCan('send-messages');

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contactId, setContactId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState(() =>
    datetimeLocalValue(new Date(Date.now() + 24 * 60 * 60 * 1000))
  );
  const [priority, setPriority] = useState<TaskPriority>('normal');

  const loadData = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const [contactsResult, tasksResult] = await Promise.all([
      supabase
        .from('contacts')
        .select('*')
        .eq('account_id', accountId)
        .order('name', { ascending: true }),
      supabase
        .from('crm_tasks')
        .select('*, contact:contacts(id, name, phone, email)')
        .eq('account_id', accountId)
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false }),
    ]);

    if (contactsResult.error) {
      toast.error(`Não foi possível carregar clientes: ${contactsResult.error.message}`);
    } else {
      setContacts((contactsResult.data ?? []) as Contact[]);
    }

    if (tasksResult.error) {
      toast.error(`Não foi possível carregar tarefas: ${tasksResult.error.message}`);
    } else {
      setTasks((tasksResult.data ?? []) as CrmTask[]);
    }
    setLoading(false);
  }, [accountId, supabase]);

  useEffect(() => {
    // Initial remote-data synchronization for this client view.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  async function createTask() {
    if (!accountId || !user?.id || !canOperate) return;
    if (!title.trim()) return toast.error('Informe o título da tarefa.');

    const dueDate = dueAt ? new Date(dueAt) : null;
    if (dueDate && Number.isNaN(dueDate.getTime())) {
      return toast.error('Informe uma data/hora válida.');
    }

    setSaving(true);
    const { error } = await supabase.from('crm_tasks').insert({
      account_id: accountId,
      user_id: user.id,
      contact_id: contactId || null,
      title: title.trim(),
      description: description.trim() || null,
      due_at: dueDate ? dueDate.toISOString() : null,
      priority,
      status: 'open',
    });
    setSaving(false);

    if (error) return toast.error(error.message);

    toast.success('Tarefa criada.');
    setTitle('');
    setDescription('');
    setContactId('');
    setPriority('normal');
    setDueAt(datetimeLocalValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
    await loadData();
  }

  async function updateTaskStatus(task: CrmTask, status: TaskStatus) {
    if (!canOperate) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('crm_tasks')
      .update({
        status,
        completed_at: status === 'completed' ? now : null,
        cancelled_at: status === 'cancelled' ? now : null,
      })
      .eq('id', task.id)
      .eq('account_id', accountId);

    if (error) return toast.error(error.message);
    toast.success(
      status === 'completed'
        ? 'Tarefa concluída.'
        : status === 'cancelled'
          ? 'Tarefa cancelada.'
          : 'Tarefa reaberta.'
    );
    await loadData();
  }

  const openTasks = tasks.filter((task) => task.status === 'open');
  const overdueTasks = openTasks.filter(isOverdue);
  const laterTasks = openTasks.filter((task) => !isOverdue(task));
  const history = tasks.filter((task) => task.status !== 'open').slice(0, 30);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-foreground flex items-center gap-2 text-2xl font-bold">
            <ClipboardCheck className="text-primary size-6" />
            Tarefas e lembretes
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Organize follow-ups, cobranças, retornos e pendências por cliente.
          </p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Atualizar
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Nova tarefa</CardTitle>
            <CardDescription>
              Crie lembretes operacionais ligados ou não a um cliente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                Cliente opcional
              </label>
              <ContactSearchSelect
                contacts={contacts}
                value={contactId}
                onChange={setContactId}
                placeholder="Selecionar cliente"
                emptyOptionLabel="Sem cliente"
                disabled={!canOperate || saving}
              />
            </div>

            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                Título
              </label>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex.: Ligar para confirmar sessão"
                disabled={!canOperate || saving}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-foreground mb-1.5 block text-sm font-medium">
                  Vencimento
                </label>
                <Input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                  disabled={!canOperate || saving}
                />
              </div>
              <div>
                <label className="text-foreground mb-1.5 block text-sm font-medium">
                  Prioridade
                </label>
                <Select
                  value={priority}
                  onValueChange={(value) => setPriority(value as TaskPriority)}
                  disabled={!canOperate || saving}
                >
                  <SelectTrigger className="h-10 w-full">
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
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                Detalhes
              </label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Notas, contexto ou próximo passo"
                rows={5}
                disabled={!canOperate || saving}
              />
            </div>

            <Button
              onClick={createTask}
              disabled={saving || !canOperate || !title.trim()}
              className="w-full"
            >
              {saving ? <Loader2 className="animate-spin" /> : <Plus />}
              Criar tarefa
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <TaskList
            title={`Atrasadas (${overdueTasks.length})`}
            description="Pendências que já passaram do horário definido."
            tasks={overdueTasks}
            loading={loading}
            empty="Nenhuma tarefa atrasada."
            onStatus={updateTaskStatus}
          />
          <TaskList
            title={`Próximas (${laterTasks.length})`}
            description="Tarefas abertas por ordem de vencimento."
            tasks={laterTasks}
            loading={loading}
            empty="Nenhuma tarefa pendente."
            onStatus={updateTaskStatus}
          />
          <TaskList
            title="Histórico"
            description="Últimas tarefas concluídas ou canceladas."
            tasks={history}
            loading={loading}
            empty="Ainda não há histórico."
            onStatus={updateTaskStatus}
          />
        </div>
      </div>
    </div>
  );
}

function TaskList({
  title,
  description,
  tasks,
  loading,
  empty,
  onStatus,
}: {
  title: string;
  description: string;
  tasks: CrmTask[];
  loading: boolean;
  empty: string;
  onStatus: (task: CrmTask, status: TaskStatus) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="text-primary size-6 animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="border-border bg-muted/20 flex h-28 flex-col items-center justify-center rounded-lg border border-dashed text-center">
            <Clock className="text-muted-foreground mb-2 size-7" />
            <p className="text-muted-foreground text-sm">{empty}</p>
          </div>
        ) : (
          <div className="divide-border divide-y">
            {tasks.map((task) => (
              <div key={task.id} className="space-y-2 py-3 first:pt-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-sm font-medium">
                      {task.title}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {contactLabel(task.contact)} · {formatDateTime(task.due_at)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${PRIORITY_CLASSES[task.priority]}`}
                  >
                    {PRIORITY_LABELS[task.priority]}
                  </span>
                </div>
                {task.description ? (
                  <p className="text-muted-foreground line-clamp-3 text-sm whitespace-pre-wrap">
                    {task.description}
                  </p>
                ) : null}
                {isOverdue(task) ? (
                  <Badge variant="destructive">Atrasada</Badge>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {task.status === 'open' ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onStatus(task, 'completed')}
                      >
                        <CheckCircle2 />
                        Concluir
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onStatus(task, 'cancelled')}
                      >
                        <XCircle />
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onStatus(task, 'open')}
                    >
                      <RotateCcw />
                      Reabrir
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
