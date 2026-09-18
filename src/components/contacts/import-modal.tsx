'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  dedupeByPhone,
  isUniqueViolation,
  normalizeKey,
} from '@/lib/contacts/dedupe';
import {
  contactImportValues,
  decodeContactCsv,
  parseContactCsv,
  type ParsedContactRow,
} from '@/lib/contacts/parse-contact-csv';
import {
  assignImportedContactTags,
  resolveImportTagIds,
  type ContactTagAssignment,
} from '@/lib/contacts/resolve-import-tags';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Tag,
  Download,
  RefreshCw,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

const DEFAULT_TAG_COLOR = '#3b82f6';
const PREVIEW_LIMIT = 5;
const CSV_TEMPLATE =
  'phone,name,email,company,tags,source,tax_id,birth_date,address_line,postal_code,city,country,marketing_consent,whatsapp_consent\n' +
  '+351912345678,Maria Silva,maria@email.pt,Empresa Exemplo,"VIP, Follow-up",Instagram,123456789,1990-05-21,Rua Exemplo 12,1000-000,Lisboa,Portugal,sim,sim\n';

type ImportPlan = {
  total: number;
  unique: number;
  duplicatePhones: number;
  existing: number;
  newRows: number;
  tagNames: string[];
};

type ImportIssue = {
  line: number;
  status: 'ignored' | 'failed';
  phone: string;
  name: string;
  reference: string;
  reason: string;
};

function importErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Erro desconhecido.';
  const value = error as { message?: string; code?: string };
  const code = value.code ? `[${value.code}] ` : '';
  return `${code}${value.message || 'Erro desconhecido.'}`;
}

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function downloadImportReport(issues: ImportIssue[]) {
  const header = [
    'linha',
    'estado',
    'referencia',
    'nome',
    'telefone',
    'motivo',
  ];
  const rows = issues.map((issue) =>
    [
      issue.line,
      issue.status,
      issue.reference,
      issue.name,
      issue.phone,
      issue.reason,
    ]
      .map(csvCell)
      .join(';')
  );
  const blob = new Blob([`\uFEFF${header.join(';')}\n${rows.join('\n')}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `relatorio-importacao-clientes-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function truncateFilename(name: string, max = 48): string {
  if (name.length <= max) return name;
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const base = name.slice(0, name.length - ext.length);
  const keep = max - ext.length - 1;
  return `${base.slice(0, Math.max(keep, 12))}…${ext}`;
}

function PreviewCell({
  value,
  mono,
  maxWidth = 'max-w-[9rem]',
}: {
  value: string;
  mono?: boolean;
  maxWidth?: string;
}) {
  return (
    <span
      className={cn(
        'block truncate',
        maxWidth,
        mono && 'font-mono text-[11px]'
      )}
      title={value}
    >
      {value}
    </span>
  );
}

function ImportPreviewTags({
  tagNames,
  tagColorByKey,
}: {
  tagNames: string[];
  tagColorByKey: Map<string, string>;
}) {
  const t = useTranslations('Contacts.importModal');

  if (tagNames.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex min-w-[4.5rem] flex-wrap gap-1">
      {tagNames.map((name) => {
        const color =
          tagColorByKey.get(name.trim().toLowerCase()) ?? DEFAULT_TAG_COLOR;
        const isKnown = tagColorByKey.has(name.trim().toLowerCase());
        return (
          <span
            key={name}
            className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] leading-none font-medium"
            style={{
              backgroundColor: `${color}18`,
              color,
              border: `1px solid ${color}${isKnown ? '55' : '30'}`,
            }}
            title={isKnown ? name : t('willBeCreated', { name })}
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="truncate">{name}</span>
          </span>
        );
      })}
    </div>
  );
}

function downloadCsvTemplate() {
  const blob = new Blob([`\uFEFF${CSV_TEMPLATE}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'modelo-importar-clientes.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function uniqueTagNames(rows: ParsedContactRow[]): string[] {
  const byKey = new Map<string, string>();
  for (const row of rows) {
    for (const name of row.tagNames) {
      const clean = name.trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, clean);
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function ImportModal({
  open,
  onOpenChange,
  onImported,
}: ImportModalProps) {
  const t = useTranslations('Contacts.importModal');
  const supabase = createClient();
  const { accountId, canEditSettings } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedContactRow[]>([]);
  const [hasTagsColumn, setHasTagsColumn] = useState(false);
  const [hasCompanyColumn, setHasCompanyColumn] = useState(false);
  const [tagColorByKey, setTagColorByKey] = useState<Map<string, string>>(
    new Map()
  );
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [createMissingTags, setCreateMissingTags] = useState(canEditSettings);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    updated: number;
    skipped: number;
    failed: number;
    tagsAssigned: number;
    issues: ImportIssue[];
  } | null>(null);

  useEffect(() => {
    if (canEditSettings) setCreateMissingTags(true);
  }, [canEditSettings]);

  function reset() {
    setFile(null);
    setParsedRows([]);
    setHasTagsColumn(false);
    setHasCompanyColumn(false);
    setTagColorByKey(new Map());
    setImportPlan(null);
    setPlanLoading(false);
    setUpdateExisting(true);
    setCreateMissingTags(canEditSettings);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setResult(null);
    setImportPlan(null);
    setPlanLoading(true);

    const text = decodeContactCsv(await selected.arrayBuffer());
    const {
      rows,
      hasTagsColumn: csvHasTags,
      hasCompanyColumn: csvHasCompany,
    } = parseContactCsv(text);

    if (rows.length === 0) {
      toast.error(t('toastNoValidRows'));
      setParsedRows([]);
      setHasTagsColumn(false);
      setHasCompanyColumn(false);
      setTagColorByKey(new Map());
      setImportPlan(null);
      setPlanLoading(false);
      return;
    }

    setParsedRows(rows);
    setHasTagsColumn(csvHasTags);
    setHasCompanyColumn(csvHasCompany);

    try {
      const { unique, duplicates } = dedupeByPhone(rows);
      const parsedPhoneKeys = new Set(
        unique.map((row) => normalizeKey(row.phone)).filter(Boolean)
      );

      let existing = 0;
      if (accountId && parsedPhoneKeys.size > 0) {
        const { data: existingRows } = await supabase
          .from('contacts')
          .select('phone, phone_normalized')
          .eq('account_id', accountId);

        for (const row of existingRows ?? []) {
          const contact = row as {
            phone: string;
            phone_normalized: string | null;
          };
          const key = normalizeKey(contact.phone_normalized || contact.phone);
          if (key && parsedPhoneKeys.has(key)) existing++;
        }
      }

      setImportPlan({
        total: rows.length,
        unique: unique.length,
        duplicatePhones: duplicates,
        existing,
        newRows: Math.max(unique.length - existing, 0),
        tagNames: uniqueTagNames(rows),
      });

      if (csvHasTags && accountId) {
        const { data: tags } = await supabase
          .from('tags')
          .select('name, color')
          .eq('account_id', accountId);

        const colors = new Map<string, string>();
        for (const tag of tags ?? []) {
          const key = tag.name.trim().toLowerCase();
          if (!colors.has(key)) colors.set(key, tag.color);
        }
        setTagColorByKey(colors);
      } else {
        setTagColorByKey(new Map());
      }
    } finally {
      setPlanLoading(false);
    }
  }

  async function handleImport() {
    if (parsedRows.length === 0) return;
    setImporting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error('Not authenticated');
      if (!accountId)
        throw new Error('Your profile is not linked to an account.');

      let imported = 0;
      let updated = 0;
      let skipped = 0;
      let failed = 0;
      const issues: ImportIssue[] = [];
      const issueFor = (
        row: ParsedContactRow,
        status: ImportIssue['status'],
        reason: string
      ) => ({
        line: Math.max(parsedRows.indexOf(row) + 2, 2),
        status,
        phone: row.phone,
        name: row.name ?? '',
        reference: row.clientReference ?? '',
        reason,
      });

      // 1) De-dupe within the file by normalized phone (keep first).
      const {
        unique,
        duplicates: inFileDupes,
        duplicateRows,
      } = dedupeByPhone(parsedRows);
      skipped += inFileDupes;
      for (const row of duplicateRows) {
        issues.push(
          issueFor(row, 'ignored', 'Telefone duplicado dentro do ficheiro.')
        );
      }

      // 2) Skip numbers already in this account. One read of the
      //    generated `phone_normalized` column (migration 022) → Set.
      const { data: existingRows } = await supabase
        .from('contacts')
        .select('id, phone, phone_normalized')
        .eq('account_id', accountId);
      const existingByPhone = new Map<string, string>();
      for (const row of existingRows ?? []) {
        const contact = row as {
          id: string;
          phone: string;
          phone_normalized: string | null;
        };
        const key = normalizeKey(contact.phone_normalized || contact.phone);
        if (key) existingByPhone.set(key, row.id);
      }

      const existingRowsToImport = unique.filter((row) =>
        existingByPhone.has(normalizeKey(row.phone))
      );
      const toUpdate = updateExisting ? existingRowsToImport : [];
      const toInsert = unique.filter(
        (row) => !existingByPhone.has(normalizeKey(row.phone))
      );
      if (!updateExisting) {
        skipped += existingRowsToImport.length;
        for (const row of existingRowsToImport) {
          issues.push(
            issueFor(
              row,
              'ignored',
              'O telefone já existe e a atualização de clientes estava desativada.'
            )
          );
        }
      }

      // 3) Resolve tag names → ids (admin+ may auto-create missing tags).
      //    Skip the round-trip when the import carries no tag names.
      const allTagNames = unique.flatMap((row) => row.tagNames);
      let tagIdByKey = new Map<string, string>();
      let skippedNames: string[] = [];
      if (allTagNames.length > 0) {
        ({ tagIdByKey, skippedNames } = await resolveImportTagIds(supabase, {
          accountId,
          userId: user.id,
          tagNames: allTagNames,
          canCreateTags: canEditSettings && createMissingTags,
        }));
      }

      const tagAssignments: ContactTagAssignment[] = [];

      const updateChunkSize = 25;
      for (let i = 0; i < toUpdate.length; i += updateChunkSize) {
        const chunk = toUpdate.slice(i, i + updateChunkSize);
        const results = await Promise.all(
          chunk.map(async (row) => {
            const contactId = existingByPhone.get(normalizeKey(row.phone));
            if (!contactId) {
              return {
                row,
                contactId: null,
                error: { message: 'Contacto existente não localizado.' },
              };
            }
            const { error } = await supabase
              .from('contacts')
              .update(contactImportValues(row))
              .eq('id', contactId)
              .eq('account_id', accountId);
            return { row, contactId, error };
          })
        );

        for (const item of results) {
          if (item.error || !item.contactId) {
            failed++;
            issues.push(
              issueFor(item.row, 'failed', importErrorMessage(item.error))
            );
            continue;
          }
          updated++;
          if (item.row.tagNames.length > 0) {
            tagAssignments.push({
              contactId: item.contactId,
              tagNames: item.row.tagNames,
            });
          }
        }
      }

      // 4) Batch insert the genuinely-new rows in chunks of 50. The DB
      //    unique index is the backstop: a 23505 (race, or a format
      //    that normalizes equal) counts as skipped, not failed.
      const chunkSize = 50;

      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const rows = chunk.map((row) => ({
          ...contactImportValues(row),
          user_id: user.id,
          account_id: accountId,
        }));

        const { data, error } = await supabase
          .from('contacts')
          .insert(rows)
          .select('id');

        if (error) {
          // Retry individually so one bad/duplicate row doesn't sink
          // the whole chunk.
          for (let j = 0; j < rows.length; j++) {
            const row = rows[j];
            const source = chunk[j];
            const { data: singleData, error: singleErr } = await supabase
              .from('contacts')
              .insert(row)
              .select('id')
              .single();

            if (!singleErr && singleData) {
              imported++;
              if (source.tagNames.length > 0) {
                tagAssignments.push({
                  contactId: singleData.id,
                  tagNames: source.tagNames,
                });
              }
            } else if (isUniqueViolation(singleErr)) {
              skipped++;
              issues.push(
                issueFor(
                  source,
                  'ignored',
                  `Registo duplicado: ${importErrorMessage(singleErr)}`
                )
              );
            } else {
              failed++;
              issues.push(
                issueFor(source, 'failed', importErrorMessage(singleErr))
              );
            }
          }
        } else {
          const inserted = data ?? [];
          imported += inserted.length;
          // inserted[j] ↔ chunk[j] only holds because a single INSERT
          // preserves RETURNING order. If this path is ever split into
          // parallel inserts, zip by phone or returned id instead.
          for (let j = 0; j < inserted.length; j++) {
            const source = chunk[j];
            if (!source || source.tagNames.length === 0) continue;
            tagAssignments.push({
              contactId: inserted[j].id,
              tagNames: source.tagNames,
            });
          }
        }
      }

      // 5) Wire tags onto the contacts we just created. Failure here must
      //    not mask a successful contact import.
      let tagsAssigned = 0;
      try {
        tagsAssigned = await assignImportedContactTags(
          supabase,
          tagAssignments,
          tagIdByKey
        );
      } catch {
        toast.warning(t('toastTagsWarning'));
      }

      setResult({
        imported,
        updated,
        skipped,
        failed,
        tagsAssigned,
        issues,
      });
      if (imported > 0) {
        toast.success(t('toastImported', { count: imported }));
      }
      if (updated > 0) {
        toast.success(t('toastUpdated', { count: updated }));
      }
      if (imported + updated > 0) {
        onImported();
      }
      if (tagsAssigned > 0) {
        toast.success(t('toastTagsAssigned', { count: tagsAssigned }));
      }
      if (skippedNames.length > 0) {
        const sample = skippedNames.slice(0, 3).join(', ');
        const more =
          skippedNames.length > 3 ? ` (+${skippedNames.length - 3} more)` : '';
        toast.info(t('toastTagsSkipped', { sample, more }));
      }
      if (skipped > 0) {
        toast.info(t('toastSkipped', { count: skipped }));
      }
      if (failed > 0) {
        toast.error(t('toastFailed', { count: failed }));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('toastError');
      toast.error(message);
    } finally {
      setImporting(false);
    }
  }

  const preview = parsedRows.slice(0, PREVIEW_LIMIT);
  // Tags: OR — show when the CSV declares a column or preview rows carry
  // values, so an all-empty tags column still renders for validation.
  const previewHasTags =
    hasTagsColumn || preview.some((row) => row.tagNames.length > 0);
  // Company: AND — hide unless the CSV declares it and preview has data,
  // avoiding an all-dash column that wastes horizontal space.
  const previewHasCompany =
    hasCompanyColumn && preview.some((row) => row.company?.trim());

  const tagStats = useMemo(() => {
    const names = new Set<string>();
    let rowsWithTags = 0;
    for (const row of parsedRows) {
      if (row.tagNames.length === 0) continue;
      rowsWithTags++;
      for (const name of row.tagNames) names.add(name.trim().toLowerCase());
    }
    return { unique: names.size, rowsWithTags };
  }, [parsedRows]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-border/80 bg-popover text-popover-foreground flex max-h-[min(90vh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="border-border/80 shrink-0 space-y-4 border-b px-6 pt-6 pb-5">
          <DialogHeader className="gap-1.5">
            <DialogTitle className="text-popover-foreground text-lg">
              {t('title')}
            </DialogTitle>
            <DialogDescription
              className="text-muted-foreground leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: t.markup('desc', {
                  phoneCode: (chunks) =>
                    `<code class="rounded bg-muted px-1 py-0.5 text-[11px] text-muted-foreground">${chunks}</code>`,
                  nameCode: (chunks) =>
                    `<code class="rounded bg-muted px-1 py-0.5 text-[11px] text-muted-foreground">${chunks}</code>`,
                  emailCode: (chunks) =>
                    `<code class="rounded bg-muted px-1 py-0.5 text-[11px] text-muted-foreground">${chunks}</code>`,
                  companyCode: (chunks) =>
                    `<code class="rounded bg-muted px-1 py-0.5 text-[11px] text-muted-foreground">${chunks}</code>`,
                  tagsCode: (chunks) =>
                    `<code class="rounded bg-muted px-1 py-0.5 text-[11px] text-muted-foreground">${chunks}</code>`,
                }),
              }}
            />
          </DialogHeader>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={downloadCsvTemplate}
            className="border-border text-muted-foreground hover:bg-muted w-fit"
          >
            <Download className="size-4" />
            {t('downloadTemplate')}
          </Button>

          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ')
                fileInputRef.current?.click();
            }}
            className={cn(
              'group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-5 transition-all',
              file
                ? 'border-primary/35 bg-primary/[0.04]'
                : 'hover:border-primary/40 border-border/80 bg-background/40 hover:bg-background/70'
            )}
          >
            {file ? (
              <>
                <div className="bg-primary/15 ring-primary/25 flex size-10 items-center justify-center rounded-lg ring-1">
                  <FileText className="text-primary size-5" />
                </div>
                <p
                  className="text-popover-foreground max-w-full truncate px-2 text-sm font-medium"
                  title={file.name}
                >
                  {truncateFilename(file.name)}
                </p>
                <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-[11px] font-medium">
                  {t('rowsReady', { count: parsedRows.length })}
                </span>
              </>
            ) : (
              <>
                <div className="bg-muted/80 ring-border/80 group-hover:bg-muted flex size-10 items-center justify-center rounded-lg ring-1 transition-colors">
                  <Upload className="text-muted-foreground group-hover:text-foreground size-5" />
                </div>
                <p className="text-muted-foreground text-sm">
                  {t('uploadDropzone')}
                </p>
                <p className="text-muted-foreground text-[11px]">
                  {t('uploadHint')}
                </p>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {preview.length > 0 && !result && (
            <div className="space-y-3">
              <div className="border-border bg-background/55 rounded-xl border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-popover-foreground text-sm font-medium">
                    {t('planTitle')}
                  </p>
                  {planLoading && (
                    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                      <RefreshCw className="size-3.5 animate-spin" />
                      {t('planLoading')}
                    </span>
                  )}
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <p className="text-muted-foreground text-[11px]">
                      {t('planTotal')}
                    </p>
                    <p className="text-popover-foreground text-lg font-semibold">
                      {importPlan?.total ?? parsedRows.length}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <p className="text-muted-foreground text-[11px]">
                      {t('planNew')}
                    </p>
                    <p className="text-primary text-lg font-semibold">
                      {importPlan?.newRows ?? '—'}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <p className="text-muted-foreground text-[11px]">
                      {t('planExisting')}
                    </p>
                    <p className="text-lg font-semibold text-emerald-500">
                      {importPlan?.existing ?? '—'}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <p className="text-muted-foreground text-[11px]">
                      {t('planDuplicates')}
                    </p>
                    <p className="text-lg font-semibold text-amber-400">
                      {importPlan?.duplicatePhones ?? '—'}
                    </p>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <Checkbox
                      checked={updateExisting}
                      onCheckedChange={(checked) =>
                        setUpdateExisting(Boolean(checked))
                      }
                      className="mt-0.5"
                    />
                    <span>
                      <span className="text-popover-foreground block font-medium">
                        {t('updateExistingLabel')}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {t('updateExistingHelp')}
                      </span>
                    </span>
                  </label>

                  {hasTagsColumn && (
                    <label
                      className={cn(
                        'flex items-start gap-2 text-sm',
                        canEditSettings
                          ? 'cursor-pointer'
                          : 'cursor-not-allowed opacity-70'
                      )}
                    >
                      <Checkbox
                        checked={canEditSettings && createMissingTags}
                        disabled={!canEditSettings}
                        onCheckedChange={(checked) =>
                          setCreateMissingTags(Boolean(checked))
                        }
                        className="mt-0.5"
                      />
                      <span>
                        <span className="text-popover-foreground block font-medium">
                          {t('createTagsLabel')}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {canEditSettings
                            ? t('createTagsHelp')
                            : t('createTagsNoPermission')}
                        </span>
                      </span>
                    </label>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                  {t('preview', { count: preview.length })}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {tagStats.rowsWithTags > 0 && (
                    <span className="bg-muted/90 text-muted-foreground inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px]">
                      <Tag className="text-primary/80 size-3" />
                      {t('previewTags', {
                        tags: tagStats.unique,
                        contacts: tagStats.rowsWithTags,
                      })}
                    </span>
                  )}
                </div>
              </div>

              <div className="border-border ring-border/50 overflow-hidden rounded-xl border ring-1">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-xs">
                    <thead>
                      <tr className="border-border bg-background/60 border-b">
                        <th className="text-muted-foreground px-3 py-2 text-left font-medium whitespace-nowrap">
                          {t('columns.phone')}
                        </th>
                        <th className="text-muted-foreground px-3 py-2 text-left font-medium whitespace-nowrap">
                          {t('columns.name')}
                        </th>
                        <th className="text-muted-foreground px-3 py-2 text-left font-medium whitespace-nowrap">
                          {t('columns.email')}
                        </th>
                        {previewHasCompany && (
                          <th className="text-muted-foreground px-3 py-2 text-left font-medium whitespace-nowrap">
                            {t('columns.company')}
                          </th>
                        )}
                        {previewHasTags && (
                          <th className="text-muted-foreground px-3 py-2 text-left font-medium whitespace-nowrap">
                            {t('columns.tags')}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-border/70 divide-y">
                      {preview.map((row, i) => (
                        <tr
                          key={i}
                          className="bg-popover/40 hover:bg-muted/30 transition-colors"
                        >
                          <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                            <PreviewCell
                              value={row.phone}
                              mono
                              maxWidth="max-w-[7.5rem]"
                            />
                          </td>
                          <td className="text-popover-foreground px-3 py-2">
                            <PreviewCell
                              value={row.name || '—'}
                              maxWidth="max-w-[8.5rem]"
                            />
                          </td>
                          <td className="text-muted-foreground px-3 py-2">
                            <PreviewCell
                              value={row.email || '—'}
                              maxWidth="max-w-[10rem]"
                            />
                          </td>
                          {previewHasCompany && (
                            <td className="text-muted-foreground px-3 py-2">
                              <PreviewCell
                                value={row.company || '—'}
                                maxWidth="max-w-[7rem]"
                              />
                            </td>
                          )}
                          {previewHasTags && (
                            <td className="px-3 py-2 align-top">
                              <ImportPreviewTags
                                tagNames={row.tagNames}
                                tagColorByKey={tagColorByKey}
                              />
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {parsedRows.length > PREVIEW_LIMIT && (
                <p className="text-muted-foreground text-center text-[11px]">
                  {t('moreRows', { count: parsedRows.length - PREVIEW_LIMIT })}
                </p>
              )}
            </div>
          )}

          {result && (
            <div className="border-border bg-background/50 rounded-xl border p-4">
              <p className="text-popover-foreground text-sm font-medium">
                {t('importComplete')}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {result.imported > 0 && (
                  <div className="text-primary flex items-center gap-1.5 text-sm">
                    <CheckCircle className="size-4 shrink-0" />
                    {t('resultImported', { count: result.imported })}
                  </div>
                )}
                {result.updated > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-emerald-500">
                    <CheckCircle className="size-4 shrink-0" />
                    {t('resultUpdated', { count: result.updated })}
                  </div>
                )}
                {result.tagsAssigned > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-cyan-400">
                    <CheckCircle className="size-4 shrink-0" />
                    {t('resultTags', { count: result.tagsAssigned })}
                  </div>
                )}
                {result.skipped > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-amber-400">
                    <AlertTriangle className="size-4 shrink-0" />
                    {t('resultSkipped', { count: result.skipped })}
                  </div>
                )}
                {result.failed > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-red-400">
                    <XCircle className="size-4 shrink-0" />
                    {t('resultFailed', { count: result.failed })}
                  </div>
                )}
              </div>
              {result.issues.length > 0 && (
                <div className="border-border/80 mt-4 space-y-3 border-t pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-popover-foreground text-sm font-medium">
                        {t('reportTitle')}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {t('reportHelp', { count: result.issues.length })}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => downloadImportReport(result.issues)}
                    >
                      <Download className="size-4" />
                      {t('downloadReport')}
                    </Button>
                  </div>
                  <div className="border-border max-h-48 overflow-auto rounded-lg border">
                    <table className="w-full min-w-[34rem] text-xs">
                      <thead className="bg-muted/70 sticky top-0">
                        <tr>
                          <th className="px-2 py-2 text-left font-medium">
                            {t('reportLine')}
                          </th>
                          <th className="px-2 py-2 text-left font-medium">
                            {t('reportContact')}
                          </th>
                          <th className="px-2 py-2 text-left font-medium">
                            {t('reportReason')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-border divide-y">
                        {result.issues.slice(0, 100).map((issue, index) => (
                          <tr key={`${issue.line}-${index}`}>
                            <td className="px-2 py-2 align-top font-mono">
                              {issue.line}
                            </td>
                            <td className="px-2 py-2 align-top">
                              <p className="font-medium">
                                {issue.name || issue.phone}
                              </p>
                              <p className="text-muted-foreground">
                                {[issue.reference, issue.phone]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            </td>
                            <td
                              className={cn(
                                'px-2 py-2 align-top',
                                issue.status === 'failed'
                                  ? 'text-red-500'
                                  : 'text-amber-500'
                              )}
                            >
                              {issue.reason}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {result.issues.length > 100 && (
                    <p className="text-muted-foreground text-xs">
                      {t('reportLimited', {
                        count: result.issues.length - 100,
                      })}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-border/80 bg-background/50 mt-0 shrink-0 gap-2 border-t px-6 py-4 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            {result ? t('close') : t('cancel')}
          </Button>
          {!result && (
            <Button
              type="button"
              disabled={parsedRows.length === 0 || importing}
              onClick={handleImport}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {importing && <Loader2 className="size-4 animate-spin" />}
              {parsedRows.length > 0
                ? t('importBtn', { count: parsedRows.length })
                : t('importBtn', { count: 0 })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
