'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  Copy,
  ExternalLink,
  Gift,
  Globe2,
  Loader2,
  ReceiptText,
  Share2,
  Save,
  ShieldCheck,
  UserRoundPen,
} from 'lucide-react';
import { toast } from 'sonner';

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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';

type PortalForm = {
  slug: string;
  enabled: boolean;
  booking_enabled: boolean;
  benefits_enabled: boolean;
  financial_enabled: boolean;
  profile_edit_enabled: boolean;
  referrals_enabled: boolean;
  welcome_title: string;
  welcome_message: string;
  cancellation_hours: string;
  booking_advance_days: string;
};

const DEFAULTS: PortalForm = {
  slug: '',
  enabled: false,
  booking_enabled: true,
  benefits_enabled: true,
  financial_enabled: true,
  profile_edit_enabled: true,
  referrals_enabled: true,
  welcome_title: 'O seu espaço de bem-estar',
  welcome_message:
    'Marque sessões, acompanhe os seus benefícios e consulte pagamentos num só lugar.',
  cancellation_hours: '24',
  booking_advance_days: '90',
};

function normalizeSlug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function ClientPortalSettings() {
  const { accountId, account, canEditSettings } = useAuth();
  const db = useMemo(() => createClient(), []);
  const [form, setForm] = useState<PortalForm>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    db.from('client_portal_settings')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          setSchemaMissing(
            error.code === '42P01' || error.message.includes('schema cache')
          );
        } else if (data) {
          setForm({
            slug: data.slug,
            enabled: data.enabled,
            booking_enabled: data.booking_enabled,
            benefits_enabled: data.benefits_enabled,
            financial_enabled: data.financial_enabled,
            profile_edit_enabled: data.profile_edit_enabled !== false,
            referrals_enabled: data.referrals_enabled !== false,
            welcome_title: data.welcome_title,
            welcome_message: data.welcome_message ?? '',
            cancellation_hours: String(data.cancellation_hours),
            booking_advance_days: String(data.booking_advance_days),
          });
        } else {
          const suffix = accountId.replaceAll('-', '').slice(0, 6);
          setForm((current) => ({
            ...current,
            slug: `${normalizeSlug(account?.name || 'clinica')}-${suffix}`,
          }));
        }
        setLoading(false);
      });
  }, [account?.name, accountId, db]);

  const portalUrl = useMemo(() => {
    const origin =
      typeof window !== 'undefined'
        ? window.location.origin
        : account?.public_url?.replace(/\/$/, '') || '';
    return form.slug ? `${origin}/portal` : '';
  }, [account?.public_url, form.slug]);

  function patch<K extends keyof PortalForm>(key: K, value: PortalForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(nextForm: PortalForm = form, successMessage = 'Portal do cliente atualizado.') {
    if (!accountId || !canEditSettings) return;
    const slug = normalizeSlug(nextForm.slug);
    if (slug.length < 3)
      return toast.error(
        'O endereço do portal deve ter pelo menos 3 caracteres.'
      );
    if (!nextForm.welcome_title.trim())
      return toast.error('Informe o título de boas-vindas.');

    setSaving(true);
    const { error } = await db.from('client_portal_settings').upsert({
      account_id: accountId,
      slug,
      enabled: nextForm.enabled,
      booking_enabled: nextForm.booking_enabled,
      benefits_enabled: nextForm.benefits_enabled,
      financial_enabled: nextForm.financial_enabled,
      profile_edit_enabled: nextForm.profile_edit_enabled,
      referrals_enabled: nextForm.referrals_enabled,
      welcome_title: nextForm.welcome_title.trim(),
      welcome_message: nextForm.welcome_message.trim() || null,
      cancellation_hours: Math.max(0, Number(nextForm.cancellation_hours) || 0),
      booking_advance_days: Math.max(
        1,
        Number(nextForm.booking_advance_days) || 90
      ),
    });
    setSaving(false);
    if (error) {
      toast.error(
        error.code === '23505'
          ? 'Este endereço já está a ser utilizado por outro portal.'
          : `Não foi possível guardar: ${error.message}`
      );
      return;
    }
    setForm({ ...nextForm, slug });
    toast.success(successMessage);
  }

  async function deactivatePortal() {
    if (!window.confirm('Inativar o Portal 360? Os clientes deixam de conseguir entrar, comprar ou agendar online. Os dados existentes serão mantidos.')) return;
    const next = { ...form, enabled: false, booking_enabled: false };
    await save(next, 'Portal inativado e marcações online bloqueadas.');
  }

  async function copyLink() {
    if (!portalUrl) return;
    await navigator.clipboard.writeText(portalUrl);
    toast.success('Link do portal copiado.');
  }

  if (loading)
    return (
      <div className="flex min-h-80 items-center justify-center">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );
  if (schemaMissing)
    return (
      <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/10">
        <CardHeader>
          <CardTitle>Portal ainda não instalado</CardTitle>
          <CardDescription>
            Aplique as migrations 068 a 072 no Supabase para ativar esta área, o
            acesso por senha e os documentos fiscais privados.
          </CardDescription>
        </CardHeader>
      </Card>
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Portal 360 do cliente</h2>
            <Badge variant={form.enabled ? 'default' : 'secondary'}>
              {form.enabled ? 'Publicado' : 'Desativado'}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Área segura para marcações, benefícios, compras e pagamentos.
          </p>
        </div>
        <div className="flex gap-2">
          {form.enabled ? (
            <Button
              variant="destructive"
              onClick={() => void deactivatePortal()}
              disabled={!canEditSettings || saving}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Globe2 />}
              Inativar portal
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={() => void copyLink()}
            disabled={!portalUrl}
          >
            <Copy /> Copiar link
          </Button>
          <Button
            variant="outline"
            disabled={!portalUrl}
            onClick={() =>
              window.open(portalUrl, '_blank', 'noopener,noreferrer')
            }
          >
            <ExternalLink /> Abrir portal
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe2 className="text-primary size-4" /> Publicação e identidade
          </CardTitle>
          <CardDescription>
            O cliente entra com email e palavra-passe. Quando necessário, recebe
            uma senha temporária no WhatsApp registado na respetiva ficha.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label="Publicar portal"
            detail="Liberta o endereço externo para os clientes."
            checked={form.enabled}
            onCheckedChange={(checked) => patch('enabled', checked)}
            disabled={!canEditSettings}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="portal-slug">Endereço do portal</Label>
              <div className="border-input bg-muted/30 flex h-10 items-center rounded-md border pl-3 text-sm">
                <span className="text-muted-foreground">/portal/</span>
                <Input
                  id="portal-slug"
                  value={form.slug}
                  onChange={(event) =>
                    patch('slug', normalizeSlug(event.target.value))
                  }
                  className="h-9 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                  disabled={!canEditSettings}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portal-title">Título de boas-vindas</Label>
              <Input
                id="portal-title"
                value={form.welcome_title}
                onChange={(event) => patch('welcome_title', event.target.value)}
                disabled={!canEditSettings}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="portal-message">Mensagem inicial</Label>
            <Textarea
              id="portal-message"
              value={form.welcome_message}
              onChange={(event) => patch('welcome_message', event.target.value)}
              rows={3}
              disabled={!canEditSettings}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Módulos disponíveis</CardTitle>
          <CardDescription>
            Controle exatamente o que aparece na conta do cliente.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-border divide-y">
          <ToggleRow
            icon={CalendarCheck}
            label="Marcações online"
            detail="Serviços, profissionais, horários livres e cancelamentos."
            checked={form.booking_enabled}
            onCheckedChange={(checked) => patch('booking_enabled', checked)}
            disabled={!canEditSettings}
          />
          <ToggleRow
            icon={Gift}
            label="Vouchers, packs e cartão-saldo"
            detail="Consulta e utilização de benefícios pertencentes ao cliente."
            checked={form.benefits_enabled}
            onCheckedChange={(checked) => patch('benefits_enabled', checked)}
            disabled={!canEditSettings}
          />
          <ToggleRow
            icon={ReceiptText}
            label="Área financeira"
            detail="Compras, pagamentos realizados e valores pendentes."
            checked={form.financial_enabled}
            onCheckedChange={(checked) => patch('financial_enabled', checked)}
            disabled={!canEditSettings}
          />
          <ToggleRow
            icon={Share2}
            label="Indique um amigo"
            detail="Código pessoal, partilha, acompanhamento e recompensas do programa de indicações."
            checked={form.referrals_enabled}
            onCheckedChange={(checked) => patch('referrals_enabled', checked)}
            disabled={!canEditSettings}
          />
          <ToggleRow
            icon={UserRoundPen}
            label="Atualização da ficha"
            detail="Permite ao cliente atualizar dados, consentimentos e fotografia. O email de acesso continua protegido."
            checked={form.profile_edit_enabled}
            onCheckedChange={(checked) =>
              patch('profile_edit_enabled', checked)
            }
            disabled={!canEditSettings}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="text-primary size-4" /> Regras operacionais
          </CardTitle>
          <CardDescription>
            Limites aplicados também no servidor para impedir marcações
            inválidas.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="portal-cancellation">
              Cancelamento mínimo (horas)
            </Label>
            <Input
              id="portal-cancellation"
              type="number"
              min="0"
              max="720"
              value={form.cancellation_hours}
              onChange={(event) =>
                patch('cancellation_hours', event.target.value)
              }
              disabled={!canEditSettings}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="portal-advance">Antecedência máxima (dias)</Label>
            <Input
              id="portal-advance"
              type="number"
              min="1"
              max="730"
              value={form.booking_advance_days}
              onChange={(event) =>
                patch('booking_advance_days', event.target.value)
              }
              disabled={!canEditSettings}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => void save()}
          disabled={!canEditSettings || saving}
        >
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Guardar
          portal
        </Button>
      </div>
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  detail,
  checked,
  onCheckedChange,
  disabled,
}: {
  icon?: typeof Gift;
  label: string;
  detail: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
      {Icon ? (
        <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md">
          <Icon className="size-4" />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">{detail}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  );
}
