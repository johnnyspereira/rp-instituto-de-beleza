'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  ClipboardCheck,
  DatabaseZap,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
type Registers = {
  processors: Array<Record<string, any>>;
  activities: Array<Record<string, any>>;
  incidents: Array<Record<string, any>>;
  audit: Array<Record<string, any>>;
};
export function PrivacyOperations() {
  const [data, setData] = useState<Registers>({
    processors: [],
    activities: [],
    incidents: [],
    audit: [],
  });
  const [retention, setRetention] = useState<any>(null);
  const [processor, setProcessor] = useState({
    name: '',
    service: '',
    dataCategories: '',
    location: '',
    safeguards: '',
    agreementStatus: 'pending',
  });
  const [activity, setActivity] = useState({
    name: '',
    purposes: '',
    dataSubjects: 'Clientes',
    dataCategories: '',
    legalBasis: 'contract',
    legalReference: '',
    specialCategoryBasis: '',
    recipients: '',
    retentionRule: '',
    securityMeasures: '',
  });
  const [incident, setIncident] = useState({
    title: '',
    description: '',
    severity: 'medium',
  });
  const load = useCallback(async () => {
    const r = await fetch('/api/account/privacy/registers', {
      cache: 'no-store',
    });
    const j = await r.json();
    if (r.ok) setData(j);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function add(kind: string, payload: object) {
    const r = await fetch('/api/account/privacy/registers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, ...payload }),
    });
    const j = await r.json();
    if (!r.ok) return toast.error(j.error || 'Não foi possível guardar.');
    toast.success('Registo guardado e auditado.');
    await load();
  }
  async function preview() {
    const r = await fetch('/api/account/privacy/retention', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const j = await r.json();
    if (r.ok) setRetention(j);
    else toast.error(j.error);
  }
  async function execute() {
    if (
      prompt(
        'Escreva APLICAR RETENÇÃO para anonimizar apenas os registos elegíveis.'
      ) !== 'APLICAR RETENÇÃO'
    )
      return;
    const r = await fetch('/api/account/privacy/retention', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ execute: true, confirmText: 'APLICAR RETENÇÃO' }),
    });
    const j = await r.json();
    if (r.ok) {
      toast.success(
        `${j.count} ficha(s), ${j.anamnesis} anamnese(s), ${j.messages} mensagem(ns) e ${j.attachments} anexo(s) tratados.`
      );
      await preview();
    } else toast.error(j.error);
  }
  async function notifyCandidates() {
    const r = await fetch('/api/account/privacy/retention', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'notify' }),
    });
    const j = await r.json();
    if (!r.ok) return toast.error(j.error || 'Falha ao enviar os avisos.');
    if (j.failures?.length)
      toast.warning(
        `${j.notified} aviso(s) registado(s); ${j.failures.length} falhou(aram).`
      );
    else toast.success(`${j.notified} aviso(s) de retenção enviado(s).`);
    await preview();
  }
  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardContent className="p-5">
          <Head
            icon={DatabaseZap}
            title="Conservação e anonimização"
            text="Simule primeiro. Registos financeiros e pedidos abertos são excluídos automaticamente."
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={preview}>
              Pré-visualizar retenção
            </Button>
            {retention && (
              <>
                <span className="bg-muted rounded-lg px-3 py-2 text-sm">
                  {retention.count} elegíveis ·{' '}
                  {retention.excluded?.length || 0} protegidos
                </span>
                <span className="bg-muted rounded-lg px-3 py-2 text-sm">
                  {retention.awaitingNotice?.length || 0} aguardam aviso ·{' '}
                  {retention.expiredAnamnesis || 0} anamneses ·{' '}
                  {retention.expiredMessages || 0} mensagens vencidas
                </span>
                {(retention.awaitingNotice?.length || 0) > 0 && (
                  <Button variant="outline" onClick={notifyCandidates}>
                    Enviar avisos prévios
                  </Button>
                )}
                {retention.count > 0 && (
                  <Button variant="destructive" onClick={execute}>
                    Anonimizar elegíveis
                  </Button>
                )}
                <p className="text-muted-foreground w-full text-xs">
                  O aviso antecede a anonimização em {retention.noticeDays}{' '}
                  dias. Backups: conservação máxima de{' '}
                  {retention.backup?.retentionDays} dias; eliminações são
                  reaplicadas após qualquer restauro.
                </p>
              </>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5">
          <Head
            icon={Building2}
            title="Subcontratantes e fornecedores"
            text="Registe alojamento, email, WhatsApp, pagamentos, backups e respetivas garantias."
          />
          <Grid>
            <Input
              placeholder="Fornecedor"
              value={processor.name}
              onChange={(e) =>
                setProcessor((v) => ({ ...v, name: e.target.value }))
              }
            />
            <Input
              placeholder="Serviço"
              value={processor.service}
              onChange={(e) =>
                setProcessor((v) => ({ ...v, service: e.target.value }))
              }
            />
            <Input
              placeholder="Categorias de dados"
              value={processor.dataCategories}
              onChange={(e) =>
                setProcessor((v) => ({ ...v, dataCategories: e.target.value }))
              }
            />
            <Input
              placeholder="Local do tratamento"
              value={processor.location}
              onChange={(e) =>
                setProcessor((v) => ({ ...v, location: e.target.value }))
              }
            />
            <Input
              placeholder="Contrato e garantias"
              value={processor.safeguards}
              onChange={(e) =>
                setProcessor((v) => ({ ...v, safeguards: e.target.value }))
              }
            />
            <Button onClick={() => add('processor', processor)}>
              <Plus />
              Adicionar
            </Button>
          </Grid>
          <List values={data.processors} primary="name" secondary="service" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5">
          <Head
            icon={ClipboardCheck}
            title="Registo de atividades de tratamento"
            text="Documente cada finalidade, categorias, fundamento, destinatários, retenção e segurança."
          />
          <Grid>
            <Input
              placeholder="Atividade"
              value={activity.name}
              onChange={(e) =>
                setActivity((v) => ({ ...v, name: e.target.value }))
              }
            />
            <Input
              placeholder="Finalidades"
              value={activity.purposes}
              onChange={(e) =>
                setActivity((v) => ({ ...v, purposes: e.target.value }))
              }
            />
            <Input
              placeholder="Categorias de dados"
              value={activity.dataCategories}
              onChange={(e) =>
                setActivity((v) => ({ ...v, dataCategories: e.target.value }))
              }
            />
            <Input
              placeholder="Fundamento (ex.: contract, consent)"
              value={activity.legalBasis}
              onChange={(e) =>
                setActivity((v) => ({ ...v, legalBasis: e.target.value }))
              }
            />
            <Input
              placeholder="Referência legal (ex.: RGPD artigo 6.º, n.º 1, alínea b))"
              value={activity.legalReference}
              onChange={(e) =>
                setActivity((v) => ({
                  ...v,
                  legalReference: e.target.value,
                }))
              }
            />
            <Input
              placeholder="Regra de retenção"
              value={activity.retentionRule}
              onChange={(e) =>
                setActivity((v) => ({ ...v, retentionRule: e.target.value }))
              }
            />
            <Button onClick={() => add('activity', activity)}>
              <Plus />
              Adicionar
            </Button>
          </Grid>
          <List
            values={data.activities.map((item) => ({
              ...item,
              legal_summary: [item.legal_basis, item.legal_reference]
                .filter(Boolean)
                .join(' · '),
            }))}
            primary="name"
            secondary="legal_summary"
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5">
          <Head
            icon={AlertTriangle}
            title="Incidentes de dados pessoais"
            text="A abertura inicia a referência interna das 72 horas; a decisão de notificar permanece humana."
          />
          <Grid>
            <Input
              placeholder="Título"
              value={incident.title}
              onChange={(e) =>
                setIncident((v) => ({ ...v, title: e.target.value }))
              }
            />
            <Input
              placeholder="Descrição inicial"
              value={incident.description}
              onChange={(e) =>
                setIncident((v) => ({ ...v, description: e.target.value }))
              }
            />
            <select
              className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
              value={incident.severity}
              onChange={(e) =>
                setIncident((v) => ({ ...v, severity: e.target.value }))
              }
            >
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
              <option value="critical">Crítica</option>
            </select>
            <Button onClick={() => add('incident', incident)}>
              <Plus />
              Abrir incidente
            </Button>
          </Grid>
          <List values={data.incidents} primary="title" secondary="status" />
        </CardContent>
      </Card>
    </div>
  );
}
function Head({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof AlertTriangle;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="text-primary mt-0.5 size-5" />
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-muted-foreground text-sm">{text}</p>
      </div>
    </div>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 grid gap-2 md:grid-cols-3">{children}</div>;
}
function List({
  values,
  primary,
  secondary,
}: {
  values: Array<Record<string, any>>;
  primary: string;
  secondary: string;
}) {
  return values.length ? (
    <div className="mt-3 space-y-1">
      {values.slice(0, 8).map((v) => (
        <div
          key={v.id}
          className="border-border flex justify-between rounded-lg border px-3 py-2 text-sm"
        >
          <span>{v[primary]}</span>
          <span className="text-muted-foreground">{v[secondary]}</span>
        </div>
      ))}
    </div>
  ) : (
    <p className="text-muted-foreground mt-3 text-xs">Ainda sem registos.</p>
  );
}
