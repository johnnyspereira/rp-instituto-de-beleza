'use client';

import { useRef, useState } from 'react';
import {
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import {
  TREASURY_IMPORT_CATEGORIES,
  type TreasuryImportRow,
} from '@/lib/finance/import-types';
import { formatCurrency } from '@/lib/currency';

export function TreasuryImportDialog({
  open,
  onOpenChange,
  existing,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: {
    kind: 'payable' | 'receivable';
    amount: number;
    date: string;
    description: string;
  }[];
  onConfirm: (rows: TreasuryImportRow[], filename: string) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<TreasuryImportRow[]>([]);
  const [filename, setFilename] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function analyze(file: File) {
    setAnalyzing(true);
    setRows([]);
    setFilename(file.name);
    const form = new FormData();
    form.append('file', file);
    try {
      const response = await fetch('/api/finance/treasury/import', {
        method: 'POST',
        body: form,
      });
      const body = (await response.json().catch(() => null)) as {
        rows?: TreasuryImportRow[];
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(body?.error || 'Não foi possível analisar o ficheiro.');
      const detected = (body?.rows ?? []).map((row) => ({
        ...row,
        duplicate: existing.some(
          (item) =>
            item.kind === row.kind &&
            Math.abs(item.amount - row.amount) < 0.005 &&
            item.date === row.date &&
            item.description
              .toLocaleLowerCase('pt')
              .includes(row.description.toLocaleLowerCase('pt').slice(0, 18))
        ),
        selected: true,
      }));
      setRows(
        detected.map((row) =>
          row.duplicate ? { ...row, selected: false } : row
        )
      );
      toast.success(`${detected.length} movimento(s) identificado(s).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha na análise.');
    } finally {
      setAnalyzing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function update(id: string, patch: Partial<TreasuryImportRow>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  }
  const selected = rows.filter((row) => row.selected);

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!analyzing && !saving) onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5" /> Importação inteligente
          </DialogTitle>
          <DialogDescription>
            Envie PDF, Excel, CSV ou uma imagem. Reveja tudo antes de criar as
            entradas e saídas.
          </DialogDescription>
        </DialogHeader>
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept=".pdf,.csv,.xls,.xlsx,.png,.jpg,.jpeg,.webp,application/pdf,text/csv,image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void analyze(file);
          }}
        />
        {!rows.length ? (
          <button
            type="button"
            disabled={analyzing}
            onClick={() => inputRef.current?.click()}
            className="border-border hover:bg-muted/50 flex min-h-52 w-full flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center transition-colors"
          >
            {analyzing ? (
              <>
                <Loader2 className="mb-3 size-9 animate-spin" />
                <strong>A analisar {filename}...</strong>
                <span className="text-muted-foreground mt-1 text-sm">
                  A leitura pode demorar até um minuto.
                </span>
              </>
            ) : (
              <>
                <Upload className="mb-3 size-9" />
                <strong>Escolher documento ou imagem</strong>
                <span className="text-muted-foreground mt-1 text-sm">
                  PDF, Excel, CSV, PNG, JPG ou WEBP · máximo 12 MB
                </span>
              </>
            )}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="size-4" />
                <strong>{filename}</strong>
                <span className="text-muted-foreground">
                  {selected.length} de {rows.length} selecionados
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
              >
                <Upload /> Trocar ficheiro
              </Button>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="p-2 text-left">Usar</th>
                    <th className="p-2 text-left">Tipo</th>
                    <th className="p-2 text-left">Data</th>
                    <th className="p-2 text-left">Descrição</th>
                    <th className="p-2 text-left">Entidade</th>
                    <th className="p-2 text-left">Categoria</th>
                    <th className="p-2 text-left">Valor</th>
                    <th className="p-2 text-left">Estado</th>
                    <th className="p-2 text-left">Confiança</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={
                        row.duplicate
                          ? 'bg-amber-50/70 dark:bg-amber-950/20'
                          : 'border-t'
                      }
                    >
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={(e) =>
                            update(row.id, { selected: e.target.checked })
                          }
                        />
                      </td>
                      <td className="p-2">
                        <select
                          className="border-input bg-background h-9 rounded-md border px-2"
                          value={row.kind}
                          onChange={(e) =>
                            update(row.id, {
                              kind: e.target.value as TreasuryImportRow['kind'],
                            })
                          }
                        >
                          <option value="payable">Saída</option>
                          <option value="receivable">Entrada</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <Input
                          type="date"
                          value={row.date}
                          onChange={(e) =>
                            update(row.id, { date: e.target.value })
                          }
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={row.description}
                          onChange={(e) =>
                            update(row.id, { description: e.target.value })
                          }
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={row.counterparty}
                          onChange={(e) =>
                            update(row.id, { counterparty: e.target.value })
                          }
                        />
                      </td>
                      <td className="p-2">
                        <select
                          disabled={row.kind === 'receivable'}
                          className="border-input bg-background h-9 w-full rounded-md border px-2"
                          value={row.category}
                          onChange={(e) =>
                            update(row.id, { category: e.target.value })
                          }
                        >
                          {TREASURY_IMPORT_CATEGORIES.map((category) => (
                            <option key={category}>{category}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <Input
                          className="w-28"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={row.amount}
                          onChange={(e) =>
                            update(row.id, { amount: Number(e.target.value) })
                          }
                        />
                        <span className="text-muted-foreground text-xs">
                          {formatCurrency(row.amount, row.currency)}
                        </span>
                      </td>
                      <td className="p-2">
                        <select
                          className="border-input bg-background h-9 rounded-md border px-2"
                          value={row.settled ? 'settled' : 'pending'}
                          onChange={(e) =>
                            update(row.id, {
                              settled: e.target.value === 'settled',
                            })
                          }
                        >
                          <option value="settled">Realizado</option>
                          <option value="pending">Pendente</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <span
                          className={
                            row.confidence >= 0.8
                              ? 'text-emerald-600'
                              : row.confidence >= 0.55
                                ? 'text-amber-600'
                                : 'text-red-600'
                          }
                        >
                          {Math.round(row.confidence * 100)}%
                        </span>
                        {row.duplicate ? (
                          <div className="text-xs text-amber-700">
                            Possível duplicado
                          </div>
                        ) : null}
                      </td>
                      <td className="p-2">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            setRows((current) =>
                              current.filter((item) => item.id !== row.id)
                            )
                          }
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!selected.length || analyzing || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onConfirm(selected, filename);
                setRows([]);
                onOpenChange(false);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Sparkles />} Criar{' '}
            {selected.length} movimento(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
