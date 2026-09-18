'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Bot,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCw,
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
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { createClient } from '@/lib/supabase/client';
import type { Contact } from '@/types';

type ScheduledMessage = {
  id: string;
  account_id: string;
  user_id: string | null;
  contact_id: string;
  conversation_id: string | null;
  content_text: string;
  scheduled_at: string;
  status: 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  contact?: Pick<Contact, 'id' | 'name' | 'phone' | 'email'> | null;
};

type AutomationRule = {
  id: string;
  account_id: string;
  user_id: string | null;
  name: string;
  trigger_type: 'birthday' | 'inactivity';
  days_before: number;
  inactivity_days: number;
  send_time: string;
  message_text: string;
  is_active: boolean;
  last_run_at: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<ScheduledMessage['status'], string> = {
  scheduled: 'Agendada',
  sending: 'Enviando',
  sent: 'Enviada',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};

const STATUS_BADGES: Record<ScheduledMessage['status'], string> = {
  scheduled: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  sending: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  sent: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  failed: 'border-red-500/30 bg-red-500/10 text-red-400',
  cancelled: 'border-muted bg-muted text-muted-foreground',
};

function datetimeLocalValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function contactLabel(contact: ScheduledMessage['contact']) {
  if (!contact) return 'Cliente';
  return contact.name?.trim() || contact.phone || 'Cliente sem nome';
}

export function ScheduledMessagesPage() {
  const supabase = useMemo(() => createClient(), []);
  const { accountId, user } = useAuth();
  const canSend = useCan('send-messages');

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [contactId, setContactId] = useState('');
  const [contentText, setContentText] = useState('');
  const [scheduledAt, setScheduledAt] = useState(() =>
    datetimeLocalValue(new Date(Date.now() + 60 * 60 * 1000))
  );
  const [ruleName, setRuleName] = useState('Aniversário VIP');
  const [ruleTrigger, setRuleTrigger] =
    useState<AutomationRule['trigger_type']>('birthday');
  const [daysBefore, setDaysBefore] = useState(0);
  const [inactivityDays, setInactivityDays] = useState(45);
  const [sendTime, setSendTime] = useState('09:00');
  const [ruleMessage, setRuleMessage] = useState(
    'Olá {{nome}}, lembramos de si com carinho. Temos uma condição especial para a sua próxima marcação.'
  );

  const selectedContact = contacts.find((contact) => contact.id === contactId);

  const loadData = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const [contactsResult, messagesResult, rulesResult] = await Promise.all([
      supabase
        .from('contacts')
        .select('*')
        .eq('account_id', accountId)
        .order('name', { ascending: true }),
      supabase
        .from('scheduled_whatsapp_messages')
        .select(
          '*, contact:contacts(id, name, phone, email)'
        )
        .eq('account_id', accountId)
        .order('scheduled_at', { ascending: true }),
      supabase
        .from('marketing_automation_rules')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false }),
    ]);

    if (contactsResult.error) {
      toast.error(`Não foi possível carregar clientes: ${contactsResult.error.message}`);
    } else {
      setContacts((contactsResult.data ?? []) as Contact[]);
    }

    if (messagesResult.error) {
      toast.error(
        `Não foi possível carregar mensagens: ${messagesResult.error.message}`
      );
    } else {
      setMessages((messagesResult.data ?? []) as ScheduledMessage[]);
    }

    if (rulesResult.error) {
      toast.error(`Não foi possível carregar automações: ${rulesResult.error.message}`);
    } else {
      setRules((rulesResult.data ?? []) as AutomationRule[]);
    }
    setLoading(false);
  }, [accountId, supabase]);

  useEffect(() => {
    // Initial remote-data synchronization for this client view.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  async function createScheduledMessage() {
    if (!accountId || !user?.id || !canSend) return;
    if (!contactId) return toast.error('Selecione o cliente.');
    if (!contentText.trim()) return toast.error('Escreva a mensagem.');

    const targetDate = new Date(scheduledAt);
    if (Number.isNaN(targetDate.getTime())) {
      return toast.error('Informe uma data/hora válida.');
    }
    if (targetDate.getTime() <= Date.now()) {
      return toast.error('Escolha uma data/hora no futuro.');
    }

    setSaving(true);
    const { error } = await supabase.from('scheduled_whatsapp_messages').insert({
      account_id: accountId,
      user_id: user.id,
      contact_id: contactId,
      content_text: contentText.trim(),
      scheduled_at: targetDate.toISOString(),
      status: 'scheduled',
    });
    setSaving(false);

    if (error) return toast.error(error.message);

    toast.success('Mensagem agendada.');
    setContentText('');
    setContactId('');
    setScheduledAt(datetimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)));
    await loadData();
  }

  async function createAutomationRule() {
    if (!accountId || !user?.id || !canSend) return;
    if (!ruleName.trim()) return toast.error('Dê um nome para a automação.');
    if (!ruleMessage.trim()) return toast.error('Escreva a mensagem da automação.');

    setSavingRule(true);
    const { error } = await supabase.from('marketing_automation_rules').insert({
      account_id: accountId,
      user_id: user.id,
      name: ruleName.trim(),
      trigger_type: ruleTrigger,
      days_before: Number(daysBefore || 0),
      inactivity_days: Number(inactivityDays || 30),
      send_time: sendTime || '09:00',
      message_text: ruleMessage.trim(),
      is_active: true,
    });
    setSavingRule(false);

    if (error) return toast.error(error.message);

    toast.success('Automação criada.');
    setRuleName(ruleTrigger === 'birthday' ? 'Aniversário VIP' : 'Cliente inativo');
    setRuleMessage(
      ruleTrigger === 'birthday'
        ? 'Olá {{nome}}, lembramos de si com carinho. Temos uma condição especial para a sua próxima marcação.'
        : 'Olá {{nome}}, sentimos a sua falta. Quer marcar um retorno esta semana?'
    );
    await loadData();
  }

  async function toggleAutomationRule(rule: AutomationRule) {
    if (!canSend) return;
    const { error } = await supabase
      .from('marketing_automation_rules')
      .update({ is_active: !rule.is_active })
      .eq('id', rule.id)
      .eq('account_id', accountId);

    if (error) return toast.error(error.message);
    toast.success(rule.is_active ? 'Automação pausada.' : 'Automação ativada.');
    await loadData();
  }

  async function cancelMessage(message: ScheduledMessage) {
    if (!canSend || message.status !== 'scheduled') return;
    const { error } = await supabase
      .from('scheduled_whatsapp_messages')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', message.id)
      .eq('account_id', accountId);

    if (error) return toast.error(error.message);
    toast.success('Mensagem cancelada.');
    await loadData();
  }

  const nextMessages = messages.filter((message) =>
    ['scheduled', 'sending'].includes(message.status)
  );
  const history = messages.filter(
    (message) => !['scheduled', 'sending'].includes(message.status)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-foreground flex items-center gap-2 text-2xl font-bold">
            <CalendarClock className="text-primary size-6" />
            Mensagens agendadas
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Programe follow-ups, lembretes e mensagens de retorno para clientes.
          </p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Atualizar
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Agendar nova mensagem</CardTitle>
              <CardDescription>
                Escolha o cliente, escreva o texto e defina quando enviar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                Cliente
              </label>
              <ContactSearchSelect
                contacts={contacts}
                value={contactId}
                onChange={setContactId}
                allowEmpty={false}
                placeholder="Buscar cliente"
                emptyLabel="Nenhum cliente encontrado."
                disabled={!canSend || saving}
              />
            </div>

            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                Data/hora de envio
              </label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                min={datetimeLocalValue()}
                onChange={(event) => setScheduledAt(event.target.value)}
                disabled={!canSend || saving}
              />
            </div>

            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                Mensagem
              </label>
              <Textarea
                value={contentText}
                onChange={(event) => setContentText(event.target.value)}
                placeholder={
                  selectedContact
                    ? `Olá ${selectedContact.name || 'tudo bem'}, ...`
                    : 'Escreva a mensagem que será enviada pelo WhatsApp'
                }
                rows={7}
                disabled={!canSend || saving}
              />
              <p className="text-muted-foreground mt-1 text-xs">
                Primeira versão: envio de texto. Templates e mídia vêm na
                próxima camada.
              </p>
            </div>

              <Button
                onClick={createScheduledMessage}
                disabled={
                  saving ||
                  !canSend ||
                  !contactId ||
                  !contentText.trim() ||
                  !scheduledAt
                }
                className="w-full"
              >
                {saving ? <Loader2 className="animate-spin" /> : <Plus />}
                Agendar mensagem
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="text-primary size-5" />
                Campanhas automáticas
              </CardTitle>
              <CardDescription>
                Crie regras recorrentes por aniversário ou por clientes sem conversa recente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-foreground mb-1.5 block text-sm font-medium">
                  Nome da automação
                </label>
                <Input
                  value={ruleName}
                  onChange={(event) => setRuleName(event.target.value)}
                  disabled={!canSend || savingRule}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-foreground mb-1.5 block text-sm font-medium">
                    Gatilho
                  </label>
                  <select
                    value={ruleTrigger}
                    onChange={(event) => {
                      const value = event.target.value as AutomationRule['trigger_type'];
                      setRuleTrigger(value);
                      setRuleName(value === 'birthday' ? 'Aniversário VIP' : 'Cliente inativo');
                      setRuleMessage(
                        value === 'birthday'
                          ? 'Olá {{nome}}, lembramos de si com carinho. Temos uma condição especial para a sua próxima marcação.'
                          : 'Olá {{nome}}, sentimos a sua falta. Quer marcar um retorno esta semana?'
                      );
                    }}
                    disabled={!canSend || savingRule}
                    className="border-input bg-background ring-offset-background w-full rounded-md border px-3 py-2 text-sm"
                  >
                    <option value="birthday">Aniversário</option>
                    <option value="inactivity">Inatividade</option>
                  </select>
                </div>
                <div>
                  <label className="text-foreground mb-1.5 block text-sm font-medium">
                    Horário
                  </label>
                  <Input
                    type="time"
                    value={sendTime}
                    onChange={(event) => setSendTime(event.target.value)}
                    disabled={!canSend || savingRule}
                  />
                </div>
              </div>
              {ruleTrigger === 'birthday' ? (
                <div>
                  <label className="text-foreground mb-1.5 block text-sm font-medium">
                    Enviar quantos dias antes?
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={30}
                    value={daysBefore}
                    onChange={(event) => setDaysBefore(Number(event.target.value))}
                    disabled={!canSend || savingRule}
                  />
                </div>
              ) : (
                <div>
                  <label className="text-foreground mb-1.5 block text-sm font-medium">
                    Dias sem conversa
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={730}
                    value={inactivityDays}
                    onChange={(event) => setInactivityDays(Number(event.target.value))}
                    disabled={!canSend || savingRule}
                  />
                </div>
              )}
              <div>
                <label className="text-foreground mb-1.5 block text-sm font-medium">
                  Mensagem automática
                </label>
                <Textarea
                  value={ruleMessage}
                  onChange={(event) => setRuleMessage(event.target.value)}
                  rows={5}
                  disabled={!canSend || savingRule}
                />
                <p className="text-muted-foreground mt-1 text-xs">
                  Variáveis: {'{{nome}}'}, {'{{telefone}}'} e {'{{dias_inativo}}'}.
                </p>
              </div>
              <Button
                onClick={createAutomationRule}
                disabled={savingRule || !canSend || !ruleName.trim() || !ruleMessage.trim()}
                className="w-full"
              >
                {savingRule ? <Loader2 className="animate-spin" /> : <Plus />}
                Criar automação
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <AutomationRulesList
            rules={rules}
            loading={loading}
            onToggle={toggleAutomationRule}
          />
          <MessageList
            title="Próximas mensagens"
            description="Mensagens ainda aguardando o horário de envio."
            messages={nextMessages}
            loading={loading}
            empty="Nenhuma mensagem futura agendada."
            onCancel={cancelMessage}
          />
          <MessageList
            title="Histórico"
            description="Mensagens enviadas, canceladas ou com falha."
            messages={history}
            loading={loading}
            empty="Ainda não há histórico."
            onCancel={cancelMessage}
          />
        </div>
      </div>
    </div>
  );
}

function MessageList({
  title,
  description,
  messages,
  loading,
  empty,
  onCancel,
}: {
  title: string;
  description: string;
  messages: ScheduledMessage[];
  loading: boolean;
  empty: string;
  onCancel: (message: ScheduledMessage) => void;
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
        ) : messages.length === 0 ? (
          <div className="border-border bg-muted/20 flex h-32 flex-col items-center justify-center rounded-lg border border-dashed text-center">
            <MessageSquareText className="text-muted-foreground mb-2 size-7" />
            <p className="text-muted-foreground text-sm">{empty}</p>
          </div>
        ) : (
          <div className="divide-border divide-y">
            {messages.map((message) => (
              <div key={message.id} className="space-y-2 py-3 first:pt-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-sm font-medium">
                      {contactLabel(message.contact)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatDateTime(message.scheduled_at)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${STATUS_BADGES[message.status]}`}
                  >
                    {message.status === 'sent' ? (
                      <CheckCircle2 className="size-3" />
                    ) : message.status === 'failed' ? (
                      <XCircle className="size-3" />
                    ) : null}
                    {STATUS_LABELS[message.status]}
                  </span>
                </div>
                <p className="text-muted-foreground line-clamp-3 text-sm whitespace-pre-wrap">
                  {message.content_text}
                </p>
                {message.last_error ? (
                  <Badge variant="destructive" className="h-auto whitespace-normal">
                    {message.last_error}
                  </Badge>
                ) : null}
                {message.status === 'scheduled' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCancel(message)}
                  >
                    Cancelar
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AutomationRulesList({
  rules,
  loading,
  onToggle,
}: {
  rules: AutomationRule[];
  loading: boolean;
  onToggle: (rule: AutomationRule) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Automações configuradas</CardTitle>
        <CardDescription>
          Regras que criam mensagens automaticamente quando o gatilho acontecer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-28 items-center justify-center">
            <Loader2 className="text-primary size-6 animate-spin" />
          </div>
        ) : rules.length === 0 ? (
          <div className="border-border bg-muted/20 flex h-28 flex-col items-center justify-center rounded-lg border border-dashed text-center">
            <Bot className="text-muted-foreground mb-2 size-7" />
            <p className="text-muted-foreground text-sm">
              Ainda não há campanhas automáticas.
            </p>
          </div>
        ) : (
          <div className="divide-border divide-y">
            {rules.map((rule) => (
              <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
                <div className="min-w-0">
                  <p className="text-foreground font-medium">{rule.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {rule.trigger_type === 'birthday'
                      ? `Aniversário · ${rule.days_before} dia(s) antes`
                      : `Inatividade · ${rule.inactivity_days} dia(s) sem conversa`}
                    {' · '}
                    {String(rule.send_time).slice(0, 5)}
                  </p>
                  {rule.last_run_at ? (
                    <p className="text-muted-foreground text-xs">
                      Última leitura: {formatDateTime(rule.last_run_at)}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    className={
                      rule.is_active
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : 'border-muted bg-muted text-muted-foreground'
                    }
                  >
                    {rule.is_active ? 'Ativa' : 'Pausada'}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={() => onToggle(rule)}>
                    {rule.is_active ? 'Pausar' : 'Ativar'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
