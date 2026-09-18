'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  Clock3,
  Loader2,
  Radio,
  Save,
  Send,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Settings = {
  payables_enabled: boolean;
  payable_days_before: number[];
  overdue_daily: boolean;
  cash_enabled: boolean;
  timezone: string;
  cash_open_time: string;
  cash_close_time: string;
  close_repeat_minutes: number;
  whatsapp_enabled: boolean;
  whatsapp_phone: string;
};
const defaults: Settings = {
  payables_enabled: true,
  payable_days_before: [7, 3, 1],
  overdue_daily: true,
  cash_enabled: true,
  timezone: 'Europe/Lisbon',
  cash_open_time: '09:00',
  cash_close_time: '22:00',
  close_repeat_minutes: 30,
  whatsapp_enabled: true,
  whatsapp_phone: '+351935864343',
};

export function FinanceReminderSettings({ accountId }: { accountId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [value, setValue] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [lastTest, setLastTest] = useState<Date | null>(null);
  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from('finance_reminder_settings')
        .select('*')
        .eq('account_id', accountId)
        .maybeSingle();
      if (!error && data)
        setValue({
          ...defaults,
          ...data,
          cash_open_time: String(data.cash_open_time).slice(0, 5),
          cash_close_time: String(data.cash_close_time).slice(0, 5),
        });
      setLoading(false);
    })();
  }, [accountId, supabase]);

  const phoneIsValid = /^\+?[1-9]\d{6,14}$/.test(value.whatsapp_phone);
  const operational =
    (value.payables_enabled || value.cash_enabled) &&
    (!value.whatsapp_enabled || phoneIsValid);
  const toggleDay = (day: number) =>
    setValue((current) => ({
      ...current,
      payable_days_before: current.payable_days_before.includes(day)
        ? current.payable_days_before.filter((item) => item !== day)
        : [...current.payable_days_before, day].sort((a, b) => b - a),
    }));

  async function persist() {
    if (!value.payable_days_before.length) {
      toast.error('Escolha pelo menos um aviso antecipado.');
      return false;
    }
    if (value.whatsapp_enabled && !phoneIsValid) {
      toast.error('Use o formato internacional, por exemplo +351935864343.');
      return false;
    }
    setSaving(true);
    const { error } = await supabase
      .from('finance_reminder_settings')
      .upsert(
        { account_id: accountId, ...value },
        { onConflict: 'account_id' }
      );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success(
      'Automações guardadas. O executor verifica alertas a cada 5 minutos.'
    );
    return true;
  }
  async function testWhatsApp() {
    if (!(await persist())) return;
    setTesting(true);
    try {
      const response = await fetch('/api/finance/reminders/test', {
        method: 'POST',
      });
      const raw = await response.text();
      const contentType = response.headers.get('content-type') ?? '';
      const payload = contentType.includes('application/json')
        ? (JSON.parse(raw) as { error?: string; deliveredToWorker?: boolean })
        : null;
      if (!response.ok) {
        throw new Error(
          payload?.error ||
            `O servidor respondeu ${response.status}. Tente novamente após reiniciar a aplicação.`
        );
      }
      if (!payload) {
        throw new Error(
          'O servidor devolveu uma resposta inválida. Reinicie a aplicação Node e tente novamente.'
        );
      }
      setLastTest(new Date());
      if (!payload.deliveredToWorker) {
        throw new Error('O worker não confirmou a entrega da mensagem de teste.');
      }
      toast.success('Teste enviado ao WhatsApp. Confirme a receção no telemóvel.');
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : 'Falha no teste do WhatsApp.'
      );
    } finally {
      setTesting(false);
    }
  }
  if (loading)
    return (
      <div className="bg-card flex h-40 items-center justify-center rounded-3xl border">
        <Loader2 className="size-6 animate-spin text-emerald-600" />
      </div>
    );

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 text-white shadow-xl shadow-slate-950/10">
      <div className="relative overflow-hidden px-5 py-6 sm:px-7">
        <div className="absolute -top-28 -right-20 size-64 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-400 text-slate-950">
              <BellRing />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold">
                  Piloto automático financeiro
                </h3>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                    operational
                      ? 'bg-emerald-400/15 text-emerald-300'
                      : 'bg-amber-400/15 text-amber-200'
                  )}
                >
                  <Radio className="size-3.5" />
                  {operational ? 'Operacional' : 'Atenção necessária'}
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-slate-300">
                Controla vencimentos e caixa, cria alertas no CRM e envia pelo
                WhatsApp sem duplicar mensagens.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Status icon={<Clock3 />} text="Verificação a cada 5 min" />
            <Status icon={<ShieldCheck />} text="Anti-duplicação ativa" />
          </div>
        </div>
      </div>
      <div className="grid gap-px bg-white/10 lg:grid-cols-2">
        <Block
          title="Contas e vencimentos"
          description="Avise antes do prazo e acompanhe atrasos até à liquidação."
          checked={value.payables_enabled}
          onCheckedChange={(checked) =>
            setValue({ ...value, payables_enabled: checked })
          }
        >
          <p className="mb-2 text-xs font-medium text-slate-300">
            Antecedência dos avisos
          </p>
          <div className="flex flex-wrap gap-2">
            {[30, 14, 7, 3, 1].map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={cn(
                  'rounded-xl border px-3 py-2 text-xs font-semibold transition',
                  value.payable_days_before.includes(day)
                    ? 'border-emerald-400 bg-emerald-400 text-slate-950'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                )}
              >
                {day} dia{day > 1 ? 's' : ''}
              </button>
            ))}
          </div>
          <label className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
            <span>
              <strong className="block">Cobrança diária de atrasos</strong>
              <span className="text-xs text-slate-400">
                Para quando a conta for liquidada.
              </span>
            </span>
            <Switch
              checked={value.overdue_daily}
              onCheckedChange={(checked) =>
                setValue({ ...value, overdue_daily: checked })
              }
            />
          </label>
        </Block>
        <Block
          title="Disciplina do caixa"
          description="Lembra a abertura e o fecho somente enquanto estiver pendente."
          checked={value.cash_enabled}
          onCheckedChange={(checked) =>
            setValue({ ...value, cash_enabled: checked })
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <DarkField label="Abrir às">
              <Input
                type="time"
                value={value.cash_open_time}
                onChange={(e) =>
                  setValue({ ...value, cash_open_time: e.target.value })
                }
              />
            </DarkField>
            <DarkField label="Fechar até">
              <Input
                type="time"
                value={value.cash_close_time}
                onChange={(e) =>
                  setValue({ ...value, cash_close_time: e.target.value })
                }
              />
            </DarkField>
            <DarkField label="Repetir (min)">
              <Input
                type="number"
                min={5}
                max={240}
                value={value.close_repeat_minutes}
                onChange={(e) =>
                  setValue({
                    ...value,
                    close_repeat_minutes: Number(e.target.value),
                  })
                }
              />
            </DarkField>
          </div>
          <DarkField label="Fuso horário">
            <Input
              value={value.timezone}
              onChange={(e) => setValue({ ...value, timezone: e.target.value })}
            />
          </DarkField>
        </Block>
      </div>
      <div className="border-t border-white/10 bg-slate-900/90 p-5 sm:p-7">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300">
              <Smartphone />
            </span>
            <div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={value.whatsapp_enabled}
                  onCheckedChange={(checked) =>
                    setValue({ ...value, whatsapp_enabled: checked })
                  }
                />
                <p className="font-semibold">Entregar também no meu WhatsApp</p>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Usa a sessão conectada ao CRM e regista cada tentativa.
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[220px_auto_auto]">
            <Input
              aria-label="Número de WhatsApp"
              className="border-white/15 bg-white/5 text-white"
              value={value.whatsapp_phone}
              onChange={(e) =>
                setValue({
                  ...value,
                  whatsapp_phone: e.target.value.replace(/[\s()-]/g, ''),
                })
              }
            />
            <Button
              variant="outline"
              className="border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
              onClick={testWhatsApp}
              disabled={testing || saving || !value.whatsapp_enabled}
            >
              {testing ? <Loader2 className="animate-spin" /> : <Send />} Testar
              agora
            </Button>
            <Button
              className="bg-emerald-400 text-slate-950 hover:bg-emerald-300"
              onClick={() => void persist()}
              disabled={saving}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Save />} Guardar
              e ativar
            </Button>
          </div>
        </div>
        <p
          className={cn(
            'mt-4 flex items-center gap-2 text-xs',
            lastTest ? 'text-emerald-300' : 'text-slate-400'
          )}
        >
          {lastTest ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <Send className="size-4" />
          )}
          {lastTest
            ? `Teste entregue às ${lastTest.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}.`
            : 'Teste a entrega para validar número, sessão e worker.'}
        </p>
      </div>
    </section>
  );
}

function Status({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-slate-200 [&_svg]:size-4 [&_svg]:text-emerald-300">
      {icon}
      {text}
    </span>
  );
}
function Block({
  title,
  description,
  checked,
  onCheckedChange,
  children,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5 bg-slate-950 px-5 py-6 sm:px-7">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          <p className="mt-0.5 text-xs text-slate-400">{description}</p>
        </div>
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      <div
        className={cn(
          'space-y-3',
          !checked && 'pointer-events-none opacity-40'
        )}
      >
        {children}
      </div>
    </div>
  );
}
function DarkField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-medium text-slate-300 [&_input]:mt-1 [&_input]:border-white/15 [&_input]:bg-white/5 [&_input]:text-white">
      {label}
      {children}
    </label>
  );
}
