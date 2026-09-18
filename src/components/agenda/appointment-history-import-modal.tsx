'use client';

import { useRef, useState } from 'react';
import { Download, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import {
  normalizeAppointmentMatch,
  parseAppointmentHistoryCsv,
  type AppointmentHistoryCsvRow,
} from '@/lib/clinic/parse-appointment-history-csv';
import { createClient } from '@/lib/supabase/client';

type ImportIssue = { line: number; client: string; reason: string };
type ImportResult = {
  imported: number;
  linked: number;
  unlinked: number;
  ignored: number;
  failed: number;
  issues: ImportIssue[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
};

const digits = (value: string) => value.replace(/\D/g, '');

function statusFor(value: string) {
  const status = normalizeAppointmentMatch(value);
  if (status.includes('cancel')) return 'cancelled';
  if (status.includes('falt') || status.includes('no show')) return 'no_show';
  if (status.includes('confirm')) return 'confirmed';
  if (status.includes('agend') || status.includes('marcad')) return 'scheduled';
  return 'completed';
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadReport(issues: ImportIssue[]) {
  const rows = issues.map((issue) =>
    [issue.line, issue.client, issue.reason].map(csvCell).join(';')
  );
  const blob = new Blob([`\uFEFFlinha;cliente;motivo\n${rows.join('\n')}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `relatorio-importacao-agenda-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function AppointmentHistoryImportModal({
  open,
  onOpenChange,
  onImported,
}: Props) {
  const db = createClient();
  const { accountId, defaultCurrency } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<AppointmentHistoryCsvRow[]>([]);
  const [parseIssues, setParseIssues] = useState<ImportIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function reset() {
    setFileName('');
    setRows([]);
    setParseIssues([]);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder('windows-1252').decode(bytes);
    }
    const parsed = parseAppointmentHistoryCsv(text);
    setFileName(file.name);
    setRows(parsed.rows);
    setParseIssues(parsed.errors.map((issue) => ({ ...issue, client: '' })));
    setResult(null);
    if (parsed.rows.length === 0) {
      toast.error(
        parsed.errors[0]?.reason ??
          'O ficheiro não contém nenhuma marcação preenchida.'
      );
    }
  }

  async function importRows() {
    if (!accountId || rows.length === 0) return;
    setBusy(true);
    const issues = [...parseIssues];
    try {
      const [contactsRes, servicesRes, professionalsRes, appointmentsRes] =
        await Promise.all([
          db
            .from('contacts')
            .select('id,name,phone,email')
            .eq('account_id', accountId)
            .limit(10000),
          db
            .from('clinic_services')
            .select('id,name,duration_minutes,price')
            .eq('account_id', accountId)
            .limit(5000),
          db
            .from('profiles')
            .select('id,full_name,email')
            .eq('account_id', accountId)
            .limit(1000),
          db
            .from('clinic_appointments')
            .select('contact_id,service_id,scheduled_start,notes')
            .eq('account_id', accountId)
            .limit(10000),
        ]);
      const firstError = [
        contactsRes.error,
        servicesRes.error,
        professionalsRes.error,
        appointmentsRes.error,
      ].find(Boolean);
      if (firstError) throw new Error(firstError.message);

      const contacts = (contactsRes.data ?? []) as Array<{
        id: string;
        name: string | null;
        phone: string | null;
        email: string | null;
      }>;
      const services = (servicesRes.data ?? []) as Array<{
        id: string;
        name: string;
        duration_minutes: number;
        price: number;
      }>;
      const professionals = (professionalsRes.data ?? []) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
      }>;
      const existing = new Set(
        (appointmentsRes.data ?? []).map((appointment) =>
          [
            appointment.contact_id ?? '',
            appointment.service_id ?? '',
            new Date(appointment.scheduled_start).toISOString(),
          ].join('|')
        )
      );

      let linked = 0;
      let unlinked = 0;
      let ignored = 0;
      let failed = 0;
      const inserts: Array<{
        source: AppointmentHistoryCsvRow;
        linked: boolean;
        values: Record<string, unknown>;
      }> = [];

      for (const source of rows) {
        if (source.scheduledAt.getTime() > Date.now()) {
          ignored++;
          issues.push({
            line: source.sourceLine,
            client: source.client,
            reason:
              'Marcação futura; este importador aceita histórico até hoje.',
          });
          continue;
        }
        const phone = source.client.match(/\+?[\d\s().-]{7,}/)?.[0] ?? '';
        const email = source.client.match(
          /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/
        )?.[0];
        const cleanName = normalizeAppointmentMatch(
          source.client
            .replace(phone, '')
            .replace(email ?? '', '')
            .replace(/[()[\]<>|,-]+/g, ' ')
        );
        let matches = phone
          ? contacts.filter(
              (contact) => digits(contact.phone ?? '') === digits(phone)
            )
          : [];
        if (matches.length === 0 && email) {
          matches = contacts.filter(
            (contact) => contact.email?.toLowerCase() === email.toLowerCase()
          );
        }
        if (matches.length === 0 && cleanName) {
          matches = contacts.filter(
            (contact) =>
              normalizeAppointmentMatch(contact.name ?? '') === cleanName
          );
        }
        const contact = matches.length === 1 ? matches[0] : null;
        if (matches.length > 1) {
          issues.push({
            line: source.sourceLine,
            client: source.client,
            reason:
              'Cliente ambíguo; marcação importada sem ligação automática.',
          });
        } else if (!contact) {
          issues.push({
            line: source.sourceLine,
            client: source.client,
            reason:
              'Cliente não encontrado; marcação importada sem ligação automática.',
          });
        }

        const serviceMatches = services.filter(
          (service) =>
            normalizeAppointmentMatch(service.name) ===
            normalizeAppointmentMatch(source.service)
        );
        const service = serviceMatches.length === 1 ? serviceMatches[0] : null;
        const professionalMatches = professionals.filter((professional) => {
          const wanted = normalizeAppointmentMatch(source.professional);
          return (
            normalizeAppointmentMatch(professional.full_name ?? '') ===
              wanted ||
            professional.email?.toLowerCase() ===
              source.professional.toLowerCase()
          );
        });
        const professional =
          professionalMatches.length === 1 ? professionalMatches[0] : null;
        const end = new Date(
          source.scheduledAt.getTime() +
            Math.max(Number(service?.duration_minutes ?? 60), 1) * 60000
        );
        const key = [
          contact?.id ?? '',
          service?.id ?? '',
          source.scheduledAt.toISOString(),
        ].join('|');
        if (existing.has(key)) {
          ignored++;
          issues.push({
            line: source.sourceLine,
            client: source.client,
            reason: 'Marcação já existente (mesmo cliente, serviço e horário).',
          });
          continue;
        }
        existing.add(key);
        const importNotes = [
          source.notes,
          `Importado do histórico · Cliente: ${source.client || 'não indicado'}`,
          source.service ? `Serviço original: ${source.service}` : '',
          source.professional
            ? `Colaborador original: ${source.professional}`
            : '',
          source.isOnline === true ? 'Marcação online' : '',
        ]
          .filter(Boolean)
          .join('\n');
        inserts.push({
          source,
          linked: Boolean(contact),
          values: {
            account_id: accountId,
            contact_id: contact?.id ?? null,
            service_id: service?.id ?? null,
            professional_profile_id: professional?.id ?? null,
            scheduled_start: source.scheduledAt.toISOString(),
            scheduled_end: end.toISOString(),
            status: statusFor(source.status),
            source: 'manual',
            price: source.finalPrice,
            original_price: source.finalPrice + source.discount,
            currency: defaultCurrency || 'EUR',
            notes: importNotes,
            paid_at: source.paidAt?.toISOString() ?? null,
            cancelled_at:
              statusFor(source.status) === 'cancelled'
                ? source.scheduledAt.toISOString()
                : null,
          },
        });
        if (contact) linked++;
        else unlinked++;
      }

      let imported = 0;
      for (let index = 0; index < inserts.length; index += 50) {
        const chunk = inserts.slice(index, index + 50);
        const { error } = await db
          .from('clinic_appointments')
          .insert(chunk.map((item) => item.values));
        if (!error) {
          imported += chunk.length;
          continue;
        }
        for (const item of chunk) {
          const { error: rowError } = await db
            .from('clinic_appointments')
            .insert(item.values);
          if (!rowError) imported++;
          else {
            failed++;
            if (item.linked) linked--;
            else unlinked--;
            issues.push({
              line: item.source.sourceLine,
              client: item.source.client,
              reason: rowError.message,
            });
          }
        }
      }
      setResult({ imported, linked, unlinked, ignored, failed, issues });
      if (imported) {
        toast.success(`${imported} marcações históricas importadas.`);
        onImported();
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Falha ao importar a agenda.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar histórico de marcações</DialogTitle>
          <DialogDescription>
            Aceita o CSV “Marcações” com as 11 colunas originais. Apenas datas
            até hoje serão importadas e duplicados serão ignorados.
          </DialogDescription>
        </DialogHeader>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => void chooseFile(event.target.files?.[0])}
        />
        <Button variant="outline" onClick={() => inputRef.current?.click()}>
          <Upload /> {fileName || 'Escolher planilha CSV'}
        </Button>
        {fileName && (
          <div className="rounded-lg border p-3 text-sm">
            <p>{rows.length} marcações válidas encontradas.</p>
            {rows.length === 0 && (
              <p className="mt-1 text-amber-600">
                O ficheiro não contém linhas preenchidas ou possui datas
                inválidas.
              </p>
            )}
          </div>
        )}
        {result && (
          <div className="space-y-3 rounded-lg border p-3 text-sm">
            <p className="font-medium">Importação concluída</p>
            <p>
              {result.imported} importadas · {result.linked} ligadas a clientes
              · {result.unlinked} sem ligação · {result.ignored} ignoradas ·{' '}
              {result.failed} falharam
            </p>
            {result.issues.length > 0 && (
              <>
                <div className="max-h-52 overflow-auto rounded border">
                  {result.issues.slice(0, 100).map((issue, index) => (
                    <div
                      key={`${issue.line}-${index}`}
                      className="border-b px-3 py-2 last:border-0"
                    >
                      <span className="font-mono">Linha {issue.line}</span>
                      {issue.client ? ` · ${issue.client}` : ''}
                      <p className="text-muted-foreground">{issue.reason}</p>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadReport(result.issues)}
                >
                  <Download /> Baixar relatório CSV
                </Button>
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {!result && (
            <Button disabled={busy || rows.length === 0} onClick={importRows}>
              {busy && <Loader2 className="animate-spin" />}
              Importar {rows.length} marcações
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
