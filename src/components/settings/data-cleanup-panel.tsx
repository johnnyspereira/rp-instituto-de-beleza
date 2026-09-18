'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseZap,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { SettingsPanelHead } from './settings-panel-head';

const CONFIRM_TEXT = 'ZERAR TESTE';

const CLEANUP_MODULES = [
  {
    id: 'inbox',
    title: 'Atendimento e Inbox',
    description: 'Conversas, mensagens e reações do WhatsApp/Inbox.',
    level: 'operacional',
  },
  {
    id: 'clients',
    title: 'Clientes 360',
    description:
      'Clientes, notas, etiquetas vinculadas e dados ligados ao cliente. Também limpa dependências operacionais para não deixar registros órfãos.',
    level: 'crítico',
  },
  {
    id: 'sales',
    title: 'Comercial e funis',
    description: 'Deals, histórico comercial e atividades de relacionamento.',
    level: 'operacional',
  },
  {
    id: 'agenda',
    title: 'Agenda e anamnese',
    description:
      'Marcações, bloqueios de horário, histórico da agenda e fichas de anamnese.',
    level: 'operacional',
  },
  {
    id: 'finance',
    title: 'Financeiro, POS e benefícios',
    description:
      'Vendas, pagamentos, vouchers, packs, carteira/saldo, caixa, auditoria financeira e tesouraria.',
    level: 'crítico',
  },
  {
    id: 'marketing',
    title: 'Transmissões, automações e fluxos',
    description:
      'Broadcasts, destinatários, automações, execuções pendentes, logs e fluxos.',
    level: 'operacional',
  },
  {
    id: 'notifications',
    title: 'Notificações',
    description: 'Central de notificações, alertas e inscrições push.',
    level: 'baixo',
  },
  {
    id: 'portal',
    title: 'Portal, suporte e sessões',
    description:
      'Acessos do Portal 360, notificações do portal, tickets de suporte e leads do site público.',
    level: 'operacional',
  },
  {
    id: 'catalogs',
    title: 'Catálogos e configurações de teste',
    description:
      'Etiquetas, campos personalizados, modelos, respostas internas, serviços, produtos, salas, pipelines e packs de catálogo.',
    level: 'crítico',
  },
] as const;

type CleanupModule = (typeof CLEANUP_MODULES)[number]['id'];

type CleanupSummary = Record<
  CleanupModule,
  {
    label: string;
    count: number;
    tables: Record<string, number>;
  }
>;

type CleanupResponse = {
  dryRun: boolean;
  total: number;
  requestedModules: CleanupModule[];
  expandedModules: CleanupModule[];
  confirmText: string;
  summary: CleanupSummary;
};

function levelClass(level: string) {
  if (level === 'crítico') return 'border-red-200 bg-red-50 text-red-700';
  if (level === 'operacional')
    return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-blue-200 bg-blue-50 text-blue-700';
}

export function DataCleanupPanel() {
  const [selected, setSelected] = useState<CleanupModule[]>([]);
  const [preview, setPreview] = useState<CleanupResponse | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const canExecute = (preview?.total ?? 0) > 0 && confirmText === CONFIRM_TEXT;

  function toggle(module: CleanupModule) {
    setPreview(null);
    setConfirmText('');
    setSelected((current) =>
      current.includes(module)
        ? current.filter((item) => item !== module)
        : [...current, module]
    );
  }

  async function requestCleanup(dryRun: boolean) {
    if (selected.length === 0) {
      toast.error('Selecione pelo menos uma área para limpar.');
      return;
    }

    if (!dryRun && confirmText !== CONFIRM_TEXT) {
      toast.error(`Digite exatamente ${CONFIRM_TEXT} para confirmar.`);
      return;
    }

    if (dryRun) setLoading(true);
    else setExecuting(true);

    try {
      const response = await fetch('/api/account/data-cleanup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          modules: selected,
          dryRun,
          confirmText,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        CleanupResponse | { error?: string };

      if (!response.ok) {
        toast.error(
          'error' in payload && payload.error
            ? payload.error
            : 'Não foi possível processar a limpeza.'
        );
        return;
      }

      const data = payload as CleanupResponse;
      setPreview(data);

      if (dryRun) {
        toast.success(
          data.total === 0
            ? 'Nenhum registro encontrado para as áreas selecionadas.'
            : `Prévia pronta: ${data.total} registro(s) encontrados.`
        );
      } else {
        toast.success(`Limpeza concluída: ${data.total} registro(s) apagados.`);
        setSelected([]);
        setConfirmText('');
      }
    } catch (error) {
      console.error('[DataCleanupPanel] cleanup error:', error);
      toast.error('Erro de rede ao processar a limpeza.');
    } finally {
      setLoading(false);
      setExecuting(false);
    }
  }

  return (
    <div>
      <SettingsPanelHead
        title="Limpeza de dados de teste"
        description="Zere partes do CRM com seleção por módulo. A conta, membros, cargos, permissões e identidade do workspace não são apagados por esta ferramenta."
      />

      <Alert className="mb-5 border-amber-200 bg-amber-50 text-amber-950">
        <ShieldAlert className="size-4" />
        <AlertTitle>
          Ferramenta irreversível e restrita ao proprietário
        </AlertTitle>
        <AlertDescription>
          Use apenas em fase de testes. Primeiro gere uma prévia, confira as
          áreas impactadas e só depois execute digitando a frase de confirmação.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {CLEANUP_MODULES.map((module) => {
          const checked = selectedSet.has(module.id);
          return (
            <button
              key={module.id}
              type="button"
              onClick={() => toggle(module.id)}
              className={cn(
                'border-border bg-card hover:bg-muted/50 flex min-h-36 rounded-lg border p-4 text-left transition',
                checked &&
                  'border-primary bg-primary-soft/30 ring-primary/25 ring-2'
              )}
            >
              <div className="flex w-full gap-3">
                <Checkbox checked={checked} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-foreground text-sm font-semibold">
                      {module.title}
                    </h3>
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0 text-[10px]',
                        levelClass(module.level)
                      )}
                    >
                      {module.level}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-2 text-xs leading-5">
                    {module.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedSet.has('clients') ? (
        <Alert className="mt-4 border-red-200 bg-red-50 text-red-950">
          <AlertTriangle className="size-4" />
          <AlertTitle>Clientes 360 limpa dependências</AlertTitle>
          <AlertDescription>
            Para apagar clientes sem quebrar vínculos, a API também limpa dados
            operacionais ligados a eles, como conversas, agenda, financeiro,
            indicações, notificações e portal.
          </AlertDescription>
        </Alert>
      ) : null}

      {selectedSet.has('catalogs') ? (
        <Alert className="mt-4 border-red-200 bg-red-50 text-red-950">
          <AlertTriangle className="size-4" />
          <AlertTitle>Catálogos exigem limpeza operacional</AlertTitle>
          <AlertDescription>
            Serviços, produtos, pipelines e packs podem estar vinculados a
            agenda, financeiro e marketing. A API expande essas dependências
            para evitar registros presos por histórico.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-muted-foreground text-sm">
          {selected.length} área(s) selecionada(s)
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void requestCleanup(true)}
            disabled={loading || executing || selected.length === 0}
          >
            {loading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            Gerar prévia
          </Button>
        </div>
      </div>

      {preview ? (
        <Card className="mt-5">
          <CardContent className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <DatabaseZap className="text-primary size-5" />
                  <h3 className="text-foreground font-semibold">
                    Prévia da limpeza
                  </h3>
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {preview.total} registro(s) encontrados. Áreas expandidas:{' '}
                  {preview.expandedModules
                    .map(
                      (module) =>
                        CLEANUP_MODULES.find((item) => item.id === module)
                          ?.title ?? module
                    )
                    .join(', ')}
                  .
                </p>
              </div>
              {preview.total === 0 ? (
                <Badge className="bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="mr-1 size-3" />
                  Nada para apagar
                </Badge>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {Object.entries(preview.summary)
                .filter(([, item]) => item.count > 0)
                .map(([key, item]) => (
                  <div
                    key={key}
                    className="border-border bg-card-2/60 rounded-lg border p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">{item.label}</div>
                      <Badge variant="outline">{item.count}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(item.tables).map(([table, count]) => (
                        <span
                          key={table}
                          className="bg-muted text-muted-foreground rounded px-2 py-1 text-[11px]"
                        >
                          {table}: {count}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>

            {preview.total > 0 ? (
              <div className="border-border mt-5 border-t pt-5">
                <Label htmlFor="cleanup-confirm">
                  Digite <strong>{CONFIRM_TEXT}</strong> para liberar a limpeza
                </Label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="cleanup-confirm"
                    value={confirmText}
                    onChange={(event) => setConfirmText(event.target.value)}
                    placeholder={CONFIRM_TEXT}
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={!canExecute || executing}
                    onClick={() => void requestCleanup(false)}
                  >
                    {executing ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 size-4" />
                    )}
                    Apagar registros selecionados
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
