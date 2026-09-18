'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Clock3,
  Download,
  Eraser,
  FileLock2,
  Plus,
  Save,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingsPanelHead } from './settings-panel-head';
import { PrivacyOperations } from './privacy-operations';

type SubjectRequest = {
  id: string;
  request_type: string;
  status: string;
  requester_name: string | null;
  requester_email: string | null;
  due_at: string;
  contact_id: string | null;
  identity_verified_at: string | null;
  identity_verification_method: string | null;
  export_generated_at: string | null;
  decision: string;
  resolution_notes: string | null;
  rejection_basis: string | null;
  erasure_retention_justification: string | null;
};
const defaults = {
  controllerName: '',
  controllerEmail: '',
  controllerTaxId: '',
  controllerAddress: '',
  dpoEmail: '',
  privacyPolicyUrl: '',
  privacyNoticeVersion: '1.0',
  contactRetentionMonths: 60,
  healthRetentionMonths: 60,
  communicationRetentionMonths: 24,
  financeRetentionMonths: 120,
  inactiveContactRetentionMonths: 36,
  retentionNoticeDays: 30,
  backupRetentionDays: 30,
  backupErasurePolicy:
    'Os backups expiram automaticamente e, após um restauro, as eliminações e anonimizações registadas são reaplicadas antes do uso operacional.',
};
const requestTypes = [
  'access',
  'rectification',
  'erasure',
  'restriction',
  'objection',
  'portability',
  'withdraw_consent',
];

export function PrivacyCompliancePanel() {
  const [form, setForm] = useState(defaults);
  const [requests, setRequests] = useState<SubjectRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);
  const [draft, setDraft] = useState({
    requestType: 'access',
    requesterName: '',
    requesterEmail: '',
    details: '',
  });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/account/privacy', {
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || 'Não foi possível carregar o centro RGPD.'
        );
      const v = result.settings || {};
      setForm({
        controllerName: v.controller_name || '',
        controllerEmail: v.controller_email || '',
        controllerTaxId: v.controller_tax_id || '',
        controllerAddress: v.controller_address || '',
        dpoEmail: v.dpo_email || '',
        privacyPolicyUrl: v.privacy_policy_url || '',
        privacyNoticeVersion: v.privacy_notice_version || '1.0',
        contactRetentionMonths: v.contact_retention_months ?? 60,
        healthRetentionMonths: v.health_retention_months ?? 60,
        communicationRetentionMonths: v.communication_retention_months ?? 24,
        financeRetentionMonths: v.finance_retention_months ?? 120,
        inactiveContactRetentionMonths:
          v.inactive_contact_retention_months ?? 36,
        retentionNoticeDays: v.retention_notice_days ?? 30,
        backupRetentionDays: v.backup_retention_days ?? 30,
        backupErasurePolicy:
          v.backup_erasure_policy || defaults.backupErasurePolicy,
      });
      setRequests(result.requests || []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Erro ao carregar RGPD.'
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const set = (key: keyof typeof form, value: string | number) =>
    setForm((current) => ({ ...current, [key]: value }));
  async function save() {
    const response = await fetch('/api/account/privacy', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    });
    const result = await response.json();
    if (response.ok) toast.success('Configuração RGPD guardada.');
    else toast.error(result.error || 'Não foi possível guardar.');
  }
  async function createRequest() {
    const response = await fetch('/api/account/privacy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const result = await response.json();
    if (!response.ok)
      return toast.error(result.error || 'Não foi possível registar.');
    toast.success('Pedido registado com prazo de resposta.');
    setShowRequest(false);
    setDraft({
      requestType: 'access',
      requesterName: '',
      requesterEmail: '',
      details: '',
    });
    await load();
  }
  async function requestAction(
    id: string,
    action: string,
    payload: Record<string, unknown> = {}
  ) {
    const response = await fetch(`/api/account/privacy/requests/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
    const result = await response.json();
    if (!response.ok)
      return toast.error(
        result.error || 'Não foi possível atualizar o pedido.'
      );
    toast.success('Pedido atualizado e auditado.');
    await load();
  }
  async function verifyIdentity(item: SubjectRequest) {
    const method = prompt(
      'Método de confirmação (ex.: documento apresentado, código enviado ao email ou validação presencial):'
    )?.trim();
    if (!method) return;
    const notes = prompt(
      'Registe a evidência verificada, sem copiar dados excessivos do documento:'
    )?.trim();
    if (!notes) return;
    await requestAction(item.id, 'verify', { method, notes });
  }
  async function conclude(item: SubjectRequest, partial = false) {
    const notes = prompt(
      'Descreva concretamente as ações realizadas e a resposta dada ao titular:'
    )?.trim();
    if (!notes) return;
    let retentionJustification = '';
    if (partial) {
      retentionJustification =
        prompt(
          'Indique a obrigação legal ou outra razão que impede o cumprimento integral:'
        )?.trim() || '';
      if (!retentionJustification) return;
    }
    await requestAction(item.id, 'complete', {
      decision: partial ? 'partially_approved' : 'approved',
      notes,
      retentionJustification,
    });
  }
  async function reject(item: SubjectRequest) {
    const notes = prompt(
      'Indique o fundamento jurídico e factual da recusa:'
    )?.trim();
    if (!notes) return;
    await requestAction(item.id, 'reject', { notes });
  }
  async function anonymize(item: SubjectRequest) {
    const notes = prompt('Resuma o âmbito da anonimização:')?.trim();
    if (!notes) return;
    const retentionJustification =
      prompt(
        'Se existirem documentos fiscais a preservar, indique a justificação legal. Caso contrário, deixe vazio:'
      )?.trim() || '';
    if (
      prompt('Para confirmar a anonimização, escreva APAGAR DADOS:') !==
      'APAGAR DADOS'
    )
      return;
    await requestAction(item.id, 'anonymize', {
      notes,
      retentionJustification,
      confirmText: 'APAGAR DADOS',
    });
  }
  return (
    <section className="animate-in fade-in-50 max-w-6xl duration-200">
      <SettingsPanelHead
        title="Privacidade e RGPD"
        description="Responsável pelo tratamento, conservação, direitos dos titulares e prestação de contas."
      />
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Status
          icon={ShieldCheck}
          title="Privacidade desde a conceção"
          text="Consentimentos por finalidade e prova histórica."
        />
        <Status
          icon={Clock3}
          title="Direitos dos titulares"
          text="Prazo de um mês contado desde a receção."
        />
        <Status
          icon={FileLock2}
          title="Dados de saúde"
          text="Anamnese identificada como categoria especial."
        />
      </div>
      <Card>
        <CardContent className="space-y-5 p-5">
          <div>
            <h3 className="font-semibold">
              Responsável e aviso de privacidade
            </h3>
            <p className="text-muted-foreground text-sm">
              Os dados devem coincidir com a política entregue aos clientes.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome do responsável">
              <Input
                value={form.controllerName}
                onChange={(e) => set('controllerName', e.target.value)}
              />
            </Field>
            <Field label="Email para privacidade">
              <Input
                type="email"
                value={form.controllerEmail}
                onChange={(e) => set('controllerEmail', e.target.value)}
              />
            </Field>
            <Field label="NIF/NIPC do responsável">
              <Input
                value={form.controllerTaxId}
                onChange={(e) => set('controllerTaxId', e.target.value)}
              />
            </Field>
            <Field label="Email do EPD/DPO (se aplicável)">
              <Input
                type="email"
                value={form.dpoEmail}
                onChange={(e) => set('dpoEmail', e.target.value)}
              />
            </Field>
            <Field label="Versão do aviso">
              <Input
                value={form.privacyNoticeVersion}
                onChange={(e) => set('privacyNoticeVersion', e.target.value)}
              />
            </Field>
            <Field label="URL da política">
              <Input
                value={form.privacyPolicyUrl}
                onChange={(e) => set('privacyPolicyUrl', e.target.value)}
              />
            </Field>
            <Field label="Morada do responsável">
              <Input
                value={form.controllerAddress}
                onChange={(e) => set('controllerAddress', e.target.value)}
              />
            </Field>
          </div>
          <div>
            <h3 className="font-semibold">Matriz de conservação (meses)</h3>
            <p className="text-muted-foreground text-sm">
              Valide os prazos clínicos e fiscais antes de ativar eliminações
              automáticas.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {(
              [
                ['contactRetentionMonths', 'Clientes'],
                ['healthRetentionMonths', 'Anamnese'],
                ['communicationRetentionMonths', 'Mensagens'],
                ['financeRetentionMonths', 'Financeiro'],
                ['inactiveContactRetentionMonths', 'Inativos'],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <Input
                  type="number"
                  min={1}
                  value={form[key]}
                  onChange={(e) => set(key, Number(e.target.value))}
                />
              </Field>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Aviso antes da anonimização (dias)">
              <Input
                type="number"
                min={7}
                max={90}
                value={form.retentionNoticeDays}
                onChange={(e) =>
                  set('retentionNoticeDays', Number(e.target.value))
                }
              />
            </Field>
            <Field label="Conservação máxima dos backups (dias)">
              <Input
                type="number"
                min={1}
                max={365}
                value={form.backupRetentionDays}
                onChange={(e) =>
                  set('backupRetentionDays', Number(e.target.value))
                }
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Política de apagamento em backups e restauros">
                <Input
                  value={form.backupErasurePolicy}
                  onChange={(e) => set('backupErasurePolicy', e.target.value)}
                />
              </Field>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={save} disabled={loading}>
              <Save />
              Guardar configuração
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">Pedidos dos titulares</h3>
              <p className="text-muted-foreground text-sm">
                Acesso, retificação, apagamento, limitação, oposição e
                portabilidade.
              </p>
            </div>
            <Button variant="outline" onClick={() => setShowRequest((v) => !v)}>
              <Plus />
              Novo pedido
            </Button>
          </div>
          {showRequest && (
            <div className="bg-muted/40 mt-4 grid gap-3 rounded-lg p-4 md:grid-cols-2">
              <Field label="Direito exercido">
                <select
                  className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
                  value={draft.requestType}
                  onChange={(e) =>
                    setDraft((v) => ({ ...v, requestType: e.target.value }))
                  }
                >
                  {requestTypes.map((value) => (
                    <option key={value} value={value}>
                      {requestLabel(value)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nome">
                <Input
                  value={draft.requesterName}
                  onChange={(e) =>
                    setDraft((v) => ({ ...v, requesterName: e.target.value }))
                  }
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={draft.requesterEmail}
                  onChange={(e) =>
                    setDraft((v) => ({ ...v, requesterEmail: e.target.value }))
                  }
                />
              </Field>
              <Field label="Detalhes">
                <Input
                  value={draft.details}
                  onChange={(e) =>
                    setDraft((v) => ({ ...v, details: e.target.value }))
                  }
                />
              </Field>
              <div className="flex justify-end md:col-span-2">
                <Button onClick={createRequest}>Registar pedido</Button>
              </div>
            </div>
          )}
          <div className="mt-4 space-y-2">
            {requests.length ? (
              requests.map((item) => (
                <div
                  key={item.id}
                  className="border-border rounded-lg border p-4 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className="font-medium">
                        {item.requester_name ||
                          item.requester_email ||
                          'Titular'}
                      </span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {requestLabel(item.request_type)}
                      </span>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {item.contact_id
                          ? 'Ficha associada'
                          : 'Sem ficha associada'}{' '}
                        · Prazo:{' '}
                        {new Date(item.due_at).toLocaleDateString('pt-PT')}
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-700">
                      {item.status}
                    </span>
                  </div>
                  {item.identity_verified_at && (
                    <p className="mt-3 flex items-center gap-2 text-xs text-emerald-700">
                      <UserCheck className="size-4" /> Identidade confirmada por{' '}
                      {item.identity_verification_method || 'método registado'}{' '}
                      em{' '}
                      {new Date(item.identity_verified_at).toLocaleDateString(
                        'pt-PT'
                      )}
                      .
                    </p>
                  )}
                  {(item.resolution_notes || item.rejection_basis) && (
                    <p className="bg-muted/50 mt-3 rounded-md p-3 text-xs">
                      {item.resolution_notes || item.rejection_basis}
                    </p>
                  )}
                  {!['completed', 'rejected'].includes(item.status) && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                      {!item.identity_verified_at ? (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => verifyIdentity(item)}
                        >
                          <UserCheck /> Confirmar identidade
                        </Button>
                      ) : (
                        <>
                          <a
                            className={buttonVariants({
                              size: 'xs',
                              variant: 'outline',
                            })}
                            href={`/api/account/privacy/requests/${item.id}/export`}
                            download
                          >
                            <Download /> Gerar pacote
                          </a>
                          {item.contact_id &&
                            item.request_type === 'rectification' && (
                              <a
                                className={buttonVariants({
                                  size: 'xs',
                                  variant: 'outline',
                                })}
                                href={`/contacts/${item.contact_id}`}
                              >
                                Corrigir ficha
                              </a>
                            )}
                          {item.request_type === 'erasure' && (
                            <Button
                              size="xs"
                              variant="destructive"
                              onClick={() => anonymize(item)}
                            >
                              <Eraser /> Anonimizar
                            </Button>
                          )}
                          <Button size="xs" onClick={() => conclude(item)}>
                            Concluir integralmente
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => conclude(item, true)}
                          >
                            Concluir parcialmente
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => reject(item)}
                          >
                            Recusar
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-muted-foreground py-6 text-center text-sm">
                Nenhum pedido registado.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      <PrivacyOperations />
      <div className="mt-4 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>
          Os controlos técnicos não substituem a política de privacidade,
          contratos com subcontratantes, avaliação de impacto, formação ou
          aconselhamento jurídico.
        </p>
      </div>
    </section>
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
function Status({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof ShieldCheck;
  title: string;
  text: string;
}) {
  return (
    <Card>
      <CardContent className="flex gap-3 p-4">
        <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
          <Icon className="size-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-muted-foreground mt-1 text-xs">{text}</p>
        </div>
      </CardContent>
    </Card>
  );
}
function requestLabel(value: string) {
  return (
    (
      {
        access: 'Acesso',
        rectification: 'Retificação',
        erasure: 'Apagamento',
        restriction: 'Limitação',
        objection: 'Oposição',
        portability: 'Portabilidade',
        withdraw_consent: 'Retirada de consentimento',
      } as Record<string, string>
    )[value] || value
  );
}
