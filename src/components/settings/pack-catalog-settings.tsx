'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, PackageCheck, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import { createClient } from '@/lib/supabase/client';
import type { ClinicService, FinancePackCatalog } from '@/types';

type DraftItem = { serviceId: string; sessions: number };

export function PackCatalogSettings() {
  const { accountId, user, defaultCurrency, canEditSettings } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [packs, setPacks] = useState<FinancePackCatalog[]>([]);
  const [services, setServices] = useState<ClinicService[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(0);
  const [validity, setValidity] = useState(365);
  const [items, setItems] = useState<DraftItem[]>([
    { serviceId: '', sessions: 1 },
  ]);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const [packsRes, servicesRes] = await Promise.all([
      supabase
        .from('finance_pack_catalog')
        .select('*, items:finance_pack_items(*, service:clinic_services(*))')
        .eq('account_id', accountId)
        .order('is_active', { ascending: false })
        .order('name'),
      supabase
        .from('clinic_services')
        .select('*')
        .eq('account_id', accountId)
        .eq('is_active', true)
        .order('name'),
    ]);
    if (packsRes.error || servicesRes.error) {
      toast.error(
        packsRes.error?.message ||
          servicesRes.error?.message ||
          'Falha ao carregar packs.'
      );
    }
    setPacks((packsRes.data ?? []) as FinancePackCatalog[]);
    setServices((servicesRes.data ?? []) as ClinicService[]);
    setLoading(false);
  }, [accountId, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function startCreate() {
    setEditingId(null);
    setName('');
    setReference('');
    setDescription('');
    setPrice(0);
    setValidity(365);
    setItems([{ serviceId: '', sessions: 1 }]);
    setOpen(true);
  }

  function startEdit(pack: FinancePackCatalog) {
    setEditingId(pack.id);
    setName(pack.name);
    setReference(pack.reference ?? '');
    setDescription(pack.description ?? '');
    setPrice(Number(pack.price));
    setValidity(pack.validity_days);
    setItems(
      pack.items?.map((item) => ({
        serviceId: item.service_id,
        sessions: item.sessions,
      })) ?? [{ serviceId: '', sessions: 1 }]
    );
    setOpen(true);
  }

  async function save() {
    const selectedItems = items.filter(
      (item) => item.serviceId && item.sessions >= 1
    );
    if (
      !accountId ||
      !user?.id ||
      !canEditSettings ||
      !name.trim() ||
      selectedItems.length === 0 ||
      selectedItems.length !== items.length
    ) {
      toast.error('Preencha o nome e todas as sessões do pack.');
      return;
    }
    if (
      new Set(selectedItems.map((item) => item.serviceId)).size !==
      selectedItems.length
    ) {
      toast.error('Cada serviço pode aparecer apenas uma vez no pack. Ajuste o número de sessões.');
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      reference: reference.trim() || null,
      description: description.trim() || null,
      price,
      currency: defaultCurrency,
      validity_days: validity,
      is_active: true,
    };
    const packResult = editingId
      ? await supabase
          .from('finance_pack_catalog')
          .update(payload)
          .eq('id', editingId)
          .eq('account_id', accountId)
          .select('id')
          .single()
      : await supabase
          .from('finance_pack_catalog')
          .insert({
            ...payload,
            account_id: accountId,
            created_by_user_id: user.id,
          })
          .select('id')
          .single();
    if (packResult.error || !packResult.data) {
      setSaving(false);
      toast.error(packResult.error?.message ?? 'Falha ao guardar pack.');
      return;
    }
    if (editingId) {
      const { error } = await supabase
        .from('finance_pack_items')
        .delete()
        .eq('pack_id', editingId);
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return;
      }
    }
    const { error: itemsError } = await supabase
      .from('finance_pack_items')
      .insert(
        selectedItems.map((item) => ({
          pack_id: packResult.data.id,
          service_id: item.serviceId,
          sessions: item.sessions,
        }))
      );
    setSaving(false);
    if (itemsError) {
      toast.error(itemsError.message);
      return;
    }
    toast.success(editingId ? 'Pack atualizado.' : 'Pack criado.');
    setOpen(false);
    void load();
  }

  async function toggle(pack: FinancePackCatalog) {
    if (!canEditSettings) return;
    const { error } = await supabase
      .from('finance_pack_catalog')
      .update({ is_active: !pack.is_active })
      .eq('id', pack.id)
      .eq('account_id', accountId);
    if (error) return toast.error(error.message);
    void load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Packs de serviços</h3>
          <p className="text-muted-foreground text-xs">
            Configure preço, validade e quantidade de sessões vendidas no POS.
          </p>
        </div>
        {canEditSettings ? (
          <Button onClick={startCreate}>
            <Plus /> Novo pack
          </Button>
        ) : null}
      </div>
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="text-primary size-6 animate-spin" />
        </div>
      ) : packs.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {packs.map((pack) => (
            <div key={pack.id} className="border-border rounded-md border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{pack.name}</p>
                    <Badge variant={pack.is_active ? 'default' : 'secondary'}>
                      {pack.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {pack.reference || 'Sem referência'} · {pack.validity_days}{' '}
                    dias
                  </p>
                </div>
                <p className="font-semibold">
                  {formatCurrency(Number(pack.price), pack.currency)}
                </p>
              </div>
              <div className="mt-3 space-y-1">
                {pack.items?.map((item) => (
                  <div
                    key={item.id}
                    className="bg-muted/40 flex justify-between rounded px-2.5 py-2 text-xs"
                  >
                    <span>{item.service?.name ?? 'Serviço'}</span>
                    <strong>{item.sessions} sessões</strong>
                  </div>
                ))}
              </div>
              {canEditSettings ? (
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startEdit(pack)}
                  >
                    <Pencil /> Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void toggle(pack)}
                  >
                    {pack.is_active ? <Trash2 /> : <PackageCheck />}
                    {pack.is_active ? 'Desativar' : 'Ativar'}
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="border-border text-muted-foreground rounded-md border border-dashed p-10 text-center text-sm">
          Nenhum pack configurado.
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar pack' : 'Novo pack'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <PackField label="Nome">
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </PackField>
              <PackField label="Referência">
                <Input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </PackField>
              <PackField label="Descrição para o cliente">
                <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: 3 sessões para aliviar tensão" />
              </PackField>
              <PackField label="Preço">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(event) => setPrice(Number(event.target.value))}
                />
              </PackField>
              <PackField label="Validade em dias">
                <Input
                  type="number"
                  min="1"
                  value={validity}
                  onChange={(event) => setValidity(Number(event.target.value))}
                />
              </PackField>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Serviços incluídos</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setItems((current) => [
                      ...current,
                      { serviceId: '', sessions: 1 },
                    ])
                  }
                >
                  <Plus /> Serviço
                </Button>
              </div>
              {items.map((item, index) => (
                <div
                  key={index}
                  className="grid gap-2 sm:grid-cols-[1fr_130px_auto]"
                >
                  <select
                    className="border-input bg-background h-10 rounded-md border px-3 text-sm"
                    value={item.serviceId}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((entry, itemIndex) =>
                          itemIndex === index
                            ? { ...entry, serviceId: event.target.value }
                            : entry
                        )
                      )
                    }
                  >
                    <option value="">Selecione o serviço</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min="1"
                    value={item.sessions}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((entry, itemIndex) =>
                          itemIndex === index
                            ? { ...entry, sessions: Number(event.target.value) }
                            : entry
                        )
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={items.length === 1}
                    onClick={() =>
                      setItems((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index)
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void save()}
              disabled={
                saving ||
                !name.trim() ||
                !items.length ||
                items.some((item) => !item.serviceId || item.sessions < 1)
              }
            >
              {saving ? <Loader2 className="animate-spin" /> : <PackageCheck />}{' '}
              Guardar pack
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PackField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}
