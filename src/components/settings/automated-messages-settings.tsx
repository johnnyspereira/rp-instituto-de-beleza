'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Info, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import {
  defaultAppointmentMessageTemplates,
  type AppointmentMessageAction,
  type AppointmentMessageTemplates,
} from '@/lib/clinic/appointment-messages';
import {
  automatedMessageDefaults,
  mergeAutomatedMessageTemplates,
  type AutomatedMessageKey,
  type AutomatedMessageTemplates,
} from '@/lib/automations/message-templates';
import { createClient } from '@/lib/supabase/client';

const templateMeta: Record<AutomatedMessageKey, { title: string; detail: string }> = {
  confirmation: { title: 'Confirmação de marcação', detail: 'Enviada quando uma nova marcação pede confirmação ao cliente.' },
  reminder: { title: 'Lembrete de sessão', detail: 'Enviado automaticamente antes de uma sessão agendada ou confirmada.' },
  pending_confirmation: { title: 'Confirmação pendente', detail: 'Enviado após o prazo definido quando o cliente ainda não confirmou.' },
  review_request: { title: 'Pedido de avaliação', detail: 'Enviado depois de uma sessão concluída, com o link pessoal de avaliação.' },
  benefit_expiry: { title: 'Validade de voucher ou pack', detail: 'Enviado antes do vencimento de um benefício ativo.' },
  finance_alert: { title: 'Alerta financeiro', detail: 'Enviado quando o Centro Financeiro cria um alerta operacional.' },
  payment_request: { title: 'Pedido de pagamento online', detail: 'Usado ao enviar uma cobrança com checkout online ao cliente.' },
};

const actions = Object.keys(automatedMessageDefaults) as AutomatedMessageKey[];

export function AutomatedMessagesSettings() {
  const { accountId } = useAuth();
  const db = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<AutomatedMessageTemplates>(
    mergeAutomatedMessageTemplates(defaultAppointmentMessageTemplates)
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    let active = true;
    void db.from('clinic_communication_settings').select('automated_message_templates').eq('account_id', accountId).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      if (error) toast.error(`Não foi possível carregar os modelos: ${error.message}`);
      const saved = data?.automated_message_templates as Partial<AutomatedMessageTemplates> | null;
      if (saved) setMessages(mergeAutomatedMessageTemplates(saved));
      setLoading(false);
    });
    return () => { active = false; };
  }, [accountId, db]);

  async function save() {
    if (!accountId) return;
    const blank = actions.find((action) => !messages[action].trim());
    if (blank) { toast.error(`O modelo “${templateMeta[blank].title}” não pode ficar vazio.`); return; }
    setSaving(true);
    const { error } = await db.from('clinic_communication_settings').upsert(
      { account_id: accountId, automated_message_templates: messages },
      { onConflict: 'account_id' }
    );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Mensagens automáticas guardadas e prontas para envio.');
  }

  function reset(action: AutomatedMessageKey) {
    setMessages((current) => ({ ...current, [action]: automatedMessageDefaults[action] }));
  }

  return (
    <section className="space-y-5 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold">Mensagens automáticas da Agenda</h2>
          <p className="text-muted-foreground mt-1 text-sm">Estes modelos são usados nos envios reais por WhatsApp e email da Agenda.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" /> Ligadas ao envio automático</span>
      </div>

      <div className="rounded-lg border border-violet-200 bg-violet-50/70 p-3 text-sm text-violet-950 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100">
        <div className="flex gap-2"><Info className="mt-0.5 size-4 shrink-0" /><p>Variáveis disponíveis: <code>{'{cliente}'}</code>, <code>{'{servico}'}</code>, <code>{'{data}'}</code>, <code>{'{hora}'}</code>, <code>{'{valor}'}</code>, <code>{'{beneficio}'}</code>, <code>{'{profissional}'}</code>, <code>{'{morada}'}</code>, <code>{'{link_anamnese}'}</code> e <code>{'{empresa}'}</code>. Variáveis desconhecidas ficam visíveis no texto para evitar envios incompletos.</p></div>
      </div>

      <div className="space-y-5">
        {actions.map((action) => (
          <article key={action} className="rounded-lg border p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div><h3 className="font-medium">{templateMeta[action].title}</h3><p className="text-muted-foreground text-sm">{templateMeta[action].detail}</p></div>
              <Button variant="ghost" size="sm" onClick={() => reset(action)} disabled={loading || saving}><RotateCcw className="size-4" /> Repor texto</Button>
            </div>
            <Textarea className="min-h-44 font-mono text-sm" value={messages[action]} onChange={(event) => setMessages((current) => ({ ...current, [action]: event.target.value }))} disabled={loading || saving} aria-label={templateMeta[action].title} />
          </article>
        ))}
      </div>

      <div className="flex justify-end border-t pt-4"><Button onClick={() => void save()} disabled={loading || saving || !accountId}><Save className="size-4" /> {saving ? 'A guardar...' : 'Guardar modelos'}</Button></div>
    </section>
  );
}
