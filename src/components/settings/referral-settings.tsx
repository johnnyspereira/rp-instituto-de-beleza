'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarRange,
  Copy,
  ExternalLink,
  Gift,
  HeartHandshake,
  Loader2,
  Save,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';

type RewardType = 'none' | 'fixed_credit' | 'percentage' | 'service';
type QualificationEvent =
  'registration' | 'completed_appointment' | 'first_paid_sale';

type FormState = {
  enabled: boolean;
  headline: string;
  description: string;
  terms: string;
  qualification_event: QualificationEvent;
  referrer_reward_type: RewardType;
  referrer_reward_value: string;
  referrer_service_id: string;
  friend_reward_type: RewardType;
  friend_reward_value: string;
  friend_service_id: string;
  reward_validity_days: string;
  max_rewards_per_referrer: string;
  require_consent: boolean;
  new_clients_only: boolean;
  campaign_starts_at: string;
  campaign_ends_at: string;
  public_privacy_text: string;
  minimum_qualifying_amount: string;
};

const DEFAULTS: FormState = {
  enabled: false,
  headline: 'Partilhe bem-estar com quem gosta',
  description:
    'Convide um amigo e ambos recebem um benefício depois da primeira visita.',
  terms: '',
  qualification_event: 'first_paid_sale',
  referrer_reward_type: 'fixed_credit',
  referrer_reward_value: '10',
  referrer_service_id: '',
  friend_reward_type: 'percentage',
  friend_reward_value: '10',
  friend_service_id: '',
  reward_validity_days: '90',
  max_rewards_per_referrer: '',
  require_consent: true,
  new_clients_only: true,
  campaign_starts_at: '',
  campaign_ends_at: '',
  public_privacy_text:
    'Os dados são usados apenas para gerir o convite, o contacto e o atendimento associado.',
  minimum_qualifying_amount: '0',
};

function dateTimeInput(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

type Service = { id: string; name: string; is_active: boolean };

export function ReferralSettings() {
  const { accountId, account, canEditSettings } = useAuth();
  const db = useMemo(() => createClient(), []);
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [services, setServices] = useState<Service[]>([]);
  const [sampleCode, setSampleCode] = useState('REF-EXEMPLO');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    Promise.all([
      db
        .from('referral_program_settings')
        .select('*')
        .eq('account_id', accountId)
        .maybeSingle(),
      db
        .from('clinic_services')
        .select('id, name, is_active')
        .eq('account_id', accountId)
        .order('name'),
      db
        .from('referral_codes')
        .select('code')
        .eq('account_id', accountId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle(),
    ]).then(([settingsRes, servicesRes, codeRes]) => {
      if (settingsRes.error) {
        setSchemaMissing(
          settingsRes.error.code === '42P01' ||
            settingsRes.error.message.includes('schema cache')
        );
      } else if (settingsRes.data) {
        const row = settingsRes.data;
        setForm({
          enabled: row.enabled,
          headline: row.headline,
          description: row.description,
          terms: row.terms ?? '',
          qualification_event: row.qualification_event,
          referrer_reward_type: row.referrer_reward_type,
          referrer_reward_value: String(row.referrer_reward_value),
          referrer_service_id: row.referrer_service_id ?? '',
          friend_reward_type: row.friend_reward_type,
          friend_reward_value: String(row.friend_reward_value),
          friend_service_id: row.friend_service_id ?? '',
          reward_validity_days: String(row.reward_validity_days),
          max_rewards_per_referrer:
            row.max_rewards_per_referrer == null
              ? ''
              : String(row.max_rewards_per_referrer),
          require_consent: row.require_consent,
          new_clients_only: row.new_clients_only !== false,
          campaign_starts_at: dateTimeInput(row.campaign_starts_at),
          campaign_ends_at: dateTimeInput(row.campaign_ends_at),
          public_privacy_text: row.public_privacy_text ?? '',
          minimum_qualifying_amount: String(row.minimum_qualifying_amount ?? 0),
        });
      }
      setServices((servicesRes.data as Service[] | null) ?? []);
      if (codeRes.data?.code) setSampleCode(codeRes.data.code);
      setLoading(false);
    });
  }, [accountId, db]);

  const baseUrl = useMemo(() => {
    const configured = account?.public_url?.replace(/\/$/, '');
    if (configured) return configured;
    if (typeof window !== 'undefined') return window.location.origin;
    return '';
  }, [account?.public_url]);
  const sampleUrl = `${baseUrl}/refer/${sampleCode}`;

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!accountId || !canEditSettings) return;
    if (!form.headline.trim() || !form.description.trim()) {
      toast.error('Informe o título e a descrição pública da campanha.');
      return;
    }
    if (
      form.campaign_starts_at &&
      form.campaign_ends_at &&
      new Date(form.campaign_ends_at) <= new Date(form.campaign_starts_at)
    ) {
      toast.error('O fim da campanha deve ser posterior ao início.');
      return;
    }
    if (
      (form.referrer_reward_type === 'service' && !form.referrer_service_id) ||
      (form.friend_reward_type === 'service' && !form.friend_service_id)
    ) {
      toast.error('Selecione o procedimento oferecido em cada benefício.');
      return;
    }
    const numericRewards = [
      {
        label: 'benefício de quem indica',
        type: form.referrer_reward_type,
        value: Number(form.referrer_reward_value),
      },
      {
        label: 'benefício do amigo',
        type: form.friend_reward_type,
        value: Number(form.friend_reward_value),
      },
    ];
    const invalidReward = numericRewards.find(
      (reward) =>
        !['none', 'service'].includes(reward.type) &&
        (!Number.isFinite(reward.value) ||
          reward.value <= 0 ||
          (reward.type === 'percentage' && reward.value > 100))
    );
    if (invalidReward) {
      toast.error(`Revise o ${invalidReward.label}.`);
      return;
    }
    const validityDays = Number(form.reward_validity_days);
    if (
      !Number.isInteger(validityDays) ||
      validityDays < 1 ||
      validityDays > 730
    ) {
      toast.error('A validade deve estar entre 1 e 730 dias.');
      return;
    }
    if (form.referrer_reward_type === 'percentage') {
      toast.error(
        'Para quem indica, utilize cartão-saldo ou procedimento. O desconto percentual é aplicado apenas ao novo cliente na marcação.'
      );
      return;
    }
    setSaving(true);
    const { error } = await db.from('referral_program_settings').upsert({
      account_id: accountId,
      ...form,
      referrer_reward_value: Number(form.referrer_reward_value || 0),
      friend_reward_value: Number(form.friend_reward_value || 0),
      referrer_service_id: form.referrer_service_id || null,
      friend_service_id: form.friend_service_id || null,
      reward_validity_days: Number(form.reward_validity_days || 90),
      max_rewards_per_referrer: form.max_rewards_per_referrer
        ? Number(form.max_rewards_per_referrer)
        : null,
      campaign_starts_at: form.campaign_starts_at
        ? new Date(form.campaign_starts_at).toISOString()
        : null,
      campaign_ends_at: form.campaign_ends_at
        ? new Date(form.campaign_ends_at).toISOString()
        : null,
      minimum_qualifying_amount: Number(form.minimum_qualifying_amount || 0),
      headline: form.headline.trim(),
      description: form.description.trim(),
      terms: form.terms.trim() || null,
      public_privacy_text: form.public_privacy_text.trim() || null,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast.error(`Não foi possível guardar: ${error.message}`);
      return;
    }
    toast.success('Programa de indicações guardado.');
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );
  }

  if (schemaMissing) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader>
          <CardTitle>Programa de indicações por ativar</CardTitle>
          <CardDescription>
            Aplique as migrations 055 a 064 no Supabase para disponibilizar a
            configuração e as regras de integridade mais recentes.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <HeartHandshake className="text-primary size-5" />
            <h2 className="text-xl font-bold">Refer a friend</h2>
            <Badge variant={form.enabled ? 'default' : 'secondary'}>
              {form.enabled ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Configure como clientes convidam amigos e quando os benefícios são
            libertados.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="referral-enabled">Programa ativo</Label>
          <Switch
            id="referral-enabled"
            checked={form.enabled}
            onCheckedChange={(value) => patch('enabled', value)}
            disabled={!canEditSettings}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="size-4" /> Campanha e qualificação
          </CardTitle>
          <CardDescription>
            Texto da página pública e evento que transforma a indicação em
            recompensa.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Título público">
            <Input
              value={form.headline}
              onChange={(event) => patch('headline', event.target.value)}
            />
          </Field>
          <Field label="Qualificar quando">
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={form.qualification_event}
              onChange={(event) =>
                patch(
                  'qualification_event',
                  event.target.value as QualificationEvent
                )
              }
            >
              <option value="registration">Amigo conclui o cadastro</option>
              <option value="completed_appointment">
                Primeira marcação é concluída
              </option>
              <option value="first_paid_sale">Primeira venda é paga</option>
            </select>
          </Field>
          {form.qualification_event === 'first_paid_sale' ? (
            <Field label="Compra mínima para qualificar">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.minimum_qualifying_amount}
                onChange={(event) =>
                  patch('minimum_qualifying_amount', event.target.value)
                }
                disabled={!canEditSettings}
              />
            </Field>
          ) : null}
          <div className="md:col-span-2">
            <Field label="Descrição">
              <Textarea
                value={form.description}
                onChange={(event) => patch('description', event.target.value)}
                className="min-h-20"
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Termos e condições">
              <Textarea
                value={form.terms}
                onChange={(event) => patch('terms', event.target.value)}
                className="min-h-24"
                placeholder="Validade, limitações, exclusões e regras da campanha."
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="size-4" /> Elegibilidade e vigência
          </CardTitle>
          <CardDescription>
            Controle quem pode participar e o período em que o link aceita novos
            registos.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Início da campanha">
            <Input
              type="datetime-local"
              value={form.campaign_starts_at}
              onChange={(event) =>
                patch('campaign_starts_at', event.target.value)
              }
              disabled={!canEditSettings}
            />
          </Field>
          <Field label="Fim da campanha">
            <Input
              type="datetime-local"
              value={form.campaign_ends_at}
              onChange={(event) =>
                patch('campaign_ends_at', event.target.value)
              }
              disabled={!canEditSettings}
            />
          </Field>
          <label className="border-border flex items-center justify-between rounded-md border px-3 py-3 md:col-span-2">
            <span className="min-w-0 pr-4">
              <span className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="text-primary size-4" /> Apenas novos
                clientes
              </span>
              <span className="text-muted-foreground mt-1 block text-xs">
                Impede autoindicação e contactos que já existam na base do CRM.
              </span>
            </span>
            <Switch
              checked={form.new_clients_only}
              onCheckedChange={(value) => patch('new_clients_only', value)}
              disabled={!canEditSettings}
            />
          </label>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <RewardCard
          title="Benefício de quem indica"
          description="Crédito fixo entra diretamente no cartão-saldo após a qualificação. Procedimentos são emitidos como voucher."
          type={form.referrer_reward_type}
          value={form.referrer_reward_value}
          serviceId={form.referrer_service_id}
          services={services}
          onType={(value) => patch('referrer_reward_type', value)}
          onValue={(value) => patch('referrer_reward_value', value)}
          onService={(value) => patch('referrer_service_id', value)}
          allowPercentage={false}
        />
        <RewardCard
          title="Benefício do amigo"
          description="Aplicado automaticamente como desconto na primeira marcação vinculada à indicação."
          type={form.friend_reward_type}
          value={form.friend_reward_value}
          serviceId={form.friend_service_id}
          services={services}
          onType={(value) => patch('friend_reward_type', value)}
          onValue={(value) => patch('friend_reward_value', value)}
          onService={(value) => patch('friend_service_id', value)}
          allowPercentage
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Limites e página pública</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field label="Validade da recompensa (dias)">
            <Input
              type="number"
              min={1}
              max={730}
              value={form.reward_validity_days}
              onChange={(event) =>
                patch('reward_validity_days', event.target.value)
              }
            />
          </Field>
          <Field label="Máximo por cliente">
            <Input
              type="number"
              min={1}
              value={form.max_rewards_per_referrer}
              placeholder="Sem limite"
              onChange={(event) =>
                patch('max_rewards_per_referrer', event.target.value)
              }
            />
          </Field>
          <label className="border-border flex items-center justify-between rounded-md border px-3 py-2">
            <span className="text-sm font-medium">Exigir consentimento</span>
            <Switch
              checked={form.require_consent}
              onCheckedChange={(value) => patch('require_consent', value)}
              disabled={!canEditSettings}
            />
          </label>
          <div className="md:col-span-3">
            <Field label="Texto de privacidade da página pública">
              <Textarea
                value={form.public_privacy_text}
                onChange={(event) =>
                  patch('public_privacy_text', event.target.value)
                }
                className="min-h-20"
                disabled={!canEditSettings}
              />
            </Field>
          </div>
          <div className="border-border bg-muted/30 flex items-center gap-2 rounded-md border p-2 md:col-span-3">
            <Input value={sampleUrl} readOnly className="font-mono text-xs" />
            <Button
              variant="outline"
              size="icon"
              title="Copiar link de exemplo"
              onClick={() => {
                void navigator.clipboard.writeText(sampleUrl);
                toast.success('Link copiado.');
              }}
            >
              <Copy />
            </Button>
            <a
              href={sampleUrl}
              target="_blank"
              rel="noreferrer"
              title="Abrir página"
              className={buttonVariants({ variant: 'outline', size: 'icon' })}
            >
              <ExternalLink />
            </a>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving || !canEditSettings}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Guardar programa
        </Button>
      </div>
    </div>
  );
}

function RewardCard({
  title,
  description,
  type,
  value,
  serviceId,
  services,
  onType,
  onValue,
  onService,
  allowPercentage,
}: {
  title: string;
  description: string;
  type: RewardType;
  value: string;
  serviceId: string;
  services: Service[];
  onType: (value: RewardType) => void;
  onValue: (value: string) => void;
  onService: (value: string) => void;
  allowPercentage: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="size-4" /> {title}
        </CardTitle>
        <p className="text-muted-foreground text-xs">{description}</p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo">
          <select
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            value={type}
            onChange={(event) => onType(event.target.value as RewardType)}
          >
            <option value="none">Sem benefício</option>
            <option value="fixed_credit">Crédito fixo</option>
            {allowPercentage || type === 'percentage' ? (
              <option value="percentage" disabled={!allowPercentage}>
                Desconto percentual
              </option>
            ) : null}
            <option value="service">Procedimento</option>
          </select>
        </Field>
        {type === 'service' ? (
          <Field label="Procedimento">
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={serviceId}
              onChange={(event) => onService(event.target.value)}
            >
              <option value="">Selecione</option>
              {services
                .filter((service) => service.is_active)
                .map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
            </select>
          </Field>
        ) : type !== 'none' ? (
          <Field label={type === 'percentage' ? 'Percentagem' : 'Valor'}>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={value}
              onChange={(event) => onValue(event.target.value)}
            />
          </Field>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
