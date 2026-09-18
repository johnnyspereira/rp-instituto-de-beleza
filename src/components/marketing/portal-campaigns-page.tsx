'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Archive,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Mail,
  MessageCircle,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Upload,
  UserRound,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import {
  MEDIA_MAX_BYTES_BY_KIND,
  uploadAccountMedia,
} from '@/lib/storage/upload-media';

type Campaign = {
  id: string;
  title: string;
  summary: string;
  description: string;
  image_url: string | null;
  badge_text: string | null;
  benefit_text: string | null;
  terms: string | null;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  status: 'draft' | 'published' | 'archived';
  created_at: string;
  enrollments: {
    id: string;
    status: string;
    joined_at: string;
    sale_id?: string | null;
    contact: {
      id: string;
      name: string | null;
      phone: string;
      email: string | null;
    } | null;
  }[];
};
type Draft = {
  title: string;
  summary: string;
  description: string;
  imageUrl: string;
  badgeText: string;
  benefitText: string;
  terms: string;
  startsAt: string;
  endsAt: string;
  capacity: string;
  commerceEnabled: boolean;
  commercePrice: string;
};
const localDate = (value = new Date()) =>
  new Date(value.getTime() - value.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
const emptyDraft = (): Draft => ({
  title: '',
  summary: '',
  description: '',
  imageUrl: '',
  badgeText: 'Exclusivo',
  benefitText: '',
  terms: '',
  startsAt: localDate(),
  endsAt: localDate(new Date(Date.now() + 7 * 24 * 60 * 60_000)),
  capacity: '',
  commerceEnabled: false,
  commercePrice: '',
});

export function PortalCampaignsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { accountId, profile, canSendMessages } = useAuth();
  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [portalSlug, setPortalSlug] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [sendingCampaign, setSendingCampaign] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const [{ data, error }, { data: portal }] = await Promise.all([
      supabase
        .from('portal_campaigns')
        .select(
          '*,enrollments:portal_campaign_enrollments(id,status,joined_at,sale_id,contact:contacts(id,name,phone,email))'
        )
        .eq('account_id', accountId)
        .order('created_at', { ascending: false }),
      supabase
        .from('client_portal_settings')
        .select('slug')
        .eq('account_id', accountId)
        .maybeSingle(),
    ]);
    setPortalSlug(portal?.slug || '');
    if (error)
      toast.error(
        error.code === '42P01'
          ? 'Aplique a migração 106_portal_exclusive_campaigns.sql.'
          : error.message
      );
    else setItems((data ?? []) as Campaign[]);
    setLoading(false);
  }, [accountId, supabase]);
  useEffect(() => {
    // Loading follows the authenticated account becoming available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  function edit(item?: Campaign) {
    setEditing(item?.id ?? null);
    setDraft(
      item
        ? {
            title: item.title,
            summary: item.summary,
            description: item.description,
            imageUrl: item.image_url ?? '',
            badgeText: item.badge_text ?? '',
            benefitText: item.benefit_text ?? '',
            terms: item.terms ?? '',
            startsAt: localDate(new Date(item.starts_at)),
            endsAt: item.ends_at ? localDate(new Date(item.ends_at)) : '',
            capacity: item.capacity ? String(item.capacity) : '',
            commerceEnabled: Boolean((item as Campaign & { commerce_enabled?: boolean }).commerce_enabled),
            commercePrice: String((item as Campaign & { commerce_price?: number | null }).commerce_price ?? ''),
          }
        : emptyDraft()
    );
    setOpen(true);
  }

  async function uploadCampaignImage(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      toast.error('Use uma imagem JPG, PNG, WebP ou GIF.');
      return;
    }
    if (file.size > MEDIA_MAX_BYTES_BY_KIND.image) {
      toast.error('A imagem não pode ultrapassar 5 MB.');
      return;
    }
    setUploadingImage(true);
    try {
      const { publicUrl } = await uploadAccountMedia('chat-media', file);
      setDraft((current) => ({ ...current, imageUrl: publicUrl }));
      toast.success('Imagem carregada.');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar a imagem.'
      );
    } finally {
      setUploadingImage(false);
    }
  }
  async function save() {
    if (!accountId || !profile || !draft.title.trim())
      return toast.error('Indique o título da campanha.');
    setSaving(true);
    const row = {
      account_id: accountId,
      title: draft.title.trim(),
      summary: draft.summary.trim(),
      description: draft.description.trim(),
      image_url: draft.imageUrl.trim() || null,
      badge_text: draft.badgeText.trim() || null,
      benefit_text: draft.benefitText.trim() || null,
      terms: draft.terms.trim() || null,
      starts_at: new Date(draft.startsAt).toISOString(),
      ends_at: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
      capacity: Number(draft.capacity) > 0 ? Number(draft.capacity) : null,
      commerce_enabled: draft.commerceEnabled,
      commerce_price: draft.commerceEnabled && Number(draft.commercePrice) > 0 ? Number(draft.commercePrice) : null,
      commerce_currency: 'EUR',
      commerce_item_type: draft.commerceEnabled ? 'service' : null,
      created_by: profile.id,
    };
    const result = editing
      ? await supabase.from('portal_campaigns').update(row).eq('id', editing)
      : await supabase.from('portal_campaigns').insert(row);
    setSaving(false);
    if (result.error) return toast.error(result.error.message);
    toast.success(
      editing ? 'Campanha atualizada.' : 'Campanha criada como rascunho.'
    );
    setOpen(false);
    await load();
  }
  async function status(item: Campaign, next: Campaign['status']) {
    const { error } = await supabase
      .from('portal_campaigns')
      .update({ status: next })
      .eq('id', item.id);
    if (error) return toast.error(error.message);
    toast.success(
      next === 'published'
        ? 'Campanha publicada no portal.'
        : 'Campanha arquivada.'
    );
    await load();
  }
  async function sendEmail(item: Campaign) {
    setSendingCampaign(item.id);
    try {
      const response = await fetch(`/api/marketing/campaigns/${item.id}/email`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar a campanha.');
      toast.success(`Campanha enviada: ${result.sent} email(s), ${result.failed} falha(s).`);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Falha ao enviar campanha.'); }
    finally { setSendingCampaign(null); }
  }
  async function updateEnrollment(entry: Campaign['enrollments'][number], status: 'contacted' | 'converted' | 'cancelled') {
    const { error } = await supabase
      .from('portal_campaign_enrollments')
      .update({ status })
      .eq('id', entry.id);
    if (error) return toast.error(error.message);
    toast.success(status === 'cancelled' ? 'Interesse removido.' : status === 'converted' ? 'Cliente marcado como convertido.' : 'Cliente marcado como contactado.');
    await load();
  }
  const activeEnrollments = items.flatMap((item) =>
    item.enrollments.filter((entry) => entry.status !== 'cancelled')
  );
  const converted = activeEnrollments.filter(
    (entry) => entry.status === 'converted'
  ).length;
  if (loading)
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Megaphone /> Campanhas exclusivas
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Publique ofertas no Portal 360 e acompanhe as adesões dos clientes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {portalSlug && (
            <Button
              variant="outline"
              render={<Link href={`/portal/${portalSlug}`} target="_blank" />}
            >
              <ExternalLink /> Abrir Portal 360
            </Button>
          )}
          {canSendMessages && (
            <Button onClick={() => edit()}>
              <Plus /> Nova campanha
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CampaignMetric
          icon={Megaphone}
          label="Campanhas"
          value={items.length}
        />
        <CampaignMetric
          icon={Send}
          label="Publicadas"
          value={items.filter((item) => item.status === 'published').length}
        />
        <CampaignMetric
          icon={Users}
          label="Adesões"
          value={activeEnrollments.length}
        />
        <CampaignMetric
          icon={CheckCircle2}
          label="Convertidos"
          value={converted}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {items.length ? (
          items.map((item) => (
            <Card
              key={item.id}
              className="overflow-hidden border-violet-100 bg-gradient-to-br from-white via-white to-violet-50/60 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="mb-2 flex gap-2">
                      <Badge>
                        {item.status === 'published' &&
                        item.ends_at &&
                        new Date(item.ends_at) < new Date()
                          ? 'Expirada'
                          : item.status === 'draft'
                          ? 'Rascunho'
                          : item.status === 'published'
                            ? 'Publicada'
                            : 'Arquivada'}
                      </Badge>
                      {item.badge_text && (
                        <Badge variant="outline">{item.badge_text}</Badge>
                      )}
                    </div>
                    <CardTitle className="text-xl">{item.title}</CardTitle>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {item.summary}
                    </p>
                  </div>
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt=""
                      className="size-20 rounded-lg object-cover"
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-muted rounded-lg p-3">
                    <Users className="mb-1 size-4" />
                    <strong>
                      {
                        item.enrollments.filter((x) => x.status !== 'cancelled')
                          .length
                      }
                    </strong>
                    <div className="text-muted-foreground text-xs">
                      adesões{item.capacity ? ` / ${item.capacity}` : ''}
                    </div>
                  </div>
                  <div className="bg-muted rounded-lg p-3">
                    <CalendarDays className="mb-1 size-4" />
                    <div className="text-xs">
                      {new Date(item.starts_at).toLocaleDateString('pt-PT')} —{' '}
                      {item.ends_at
                        ? new Date(item.ends_at).toLocaleDateString('pt-PT')
                        : 'sem fim'}
                    </div>
                  </div>
                </div>
                {item.benefit_text && (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
                    <Sparkles className="size-5 shrink-0" />
                    <strong>{item.benefit_text}</strong>
                  </div>
                )}
                {item.status === 'published' && canSendMessages && (
                  <Button className="w-full" variant="outline" disabled={sendingCampaign === item.id} onClick={() => void sendEmail(item)}>
                    {sendingCampaign === item.id ? <Loader2 className="animate-spin" /> : <Mail />} Enviar por email a clientes autorizados
                  </Button>
                )}
                {item.enrollments.length > 0 && (
                  <div className="overflow-hidden rounded-xl border">
                    <div className="bg-muted/50 flex items-center justify-between px-3 py-2">
                      <p className="text-xs font-semibold tracking-wide uppercase">
                        Clientes aderentes
                      </p>
                      <span className="text-muted-foreground text-xs">
                        Contacto e ficha 360
                      </span>
                    </div>
                    {item.enrollments.slice(0, 6).map((entry) => (
                      <div
                        key={entry.id}
                        className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-3 text-sm first:border-t-0"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full font-semibold">
                            {(entry.contact?.name || 'C')
                              .slice(0, 1)
                              .toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {entry.contact?.name ||
                                entry.contact?.phone ||
                                'Cliente'}
                            </p>
                            <p className="text-muted-foreground truncate text-xs">
                              {[entry.contact?.phone, entry.contact?.email]
                                .filter(Boolean)
                                .join(' · ') || 'Sem contacto'}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              Aderiu em{' '}
                              {new Date(entry.joined_at).toLocaleDateString(
                                'pt-PT'
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {entry.contact?.id && (
                            <Button
                              size="sm"
                              variant="outline"
                              render={
                                <Link href={`/contacts/${entry.contact.id}`} />
                              }
                            >
                              <UserRound /> Ficha
                            </Button>
                          )}
                          {entry.contact?.email && (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label="Enviar email"
                              render={
                                <a href={`mailto:${entry.contact.email}`} />
                              }
                            >
                              <Mail />
                            </Button>
                          )}
                          {entry.contact?.phone && (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label="Abrir WhatsApp"
                              render={
                                <a
                                  href={`https://wa.me/${entry.contact.phone.replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                />
                              }
                            >
                              <MessageCircle />
                            </Button>
                          )}
                          {entry.sale_id ? (
                            <Button size="sm" variant="outline" render={<Link href={`/finance?tab=sales#sale-${entry.sale_id}`} />}>
                              Ver venda
                            </Button>
                          ) : entry.contact?.id ? (
                            <Button size="sm" variant="outline" render={<Link href={`/finance?tab=pos&contact=${entry.contact.id}`} />}>
                              Criar venda
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => void updateEnrollment(entry, 'contacted')}>
                              Contactado
                            </Button>
                          )}
                          {entry.status !== 'converted' && (
                            <Button size="sm" variant="outline" onClick={() => void updateEnrollment(entry, 'converted')}>
                              Converter
                            </Button>
                          )}
                          <Button size="icon-sm" variant="ghost" aria-label="Remover interesse" onClick={() => void updateEnrollment(entry, 'cancelled')}>
                            <Archive />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {item.enrollments.length > 6 && (
                      <p className="text-muted-foreground border-t px-3 py-2 text-xs">
                        + {item.enrollments.length - 6} outros clientes
                      </p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {canSendMessages && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => edit(item)}
                    >
                      <Pencil /> Editar
                    </Button>
                  )}
                  {canSendMessages && item.status !== 'published' && (
                    <Button
                      size="sm"
                      onClick={() => void status(item, 'published')}
                    >
                      <Send /> Publicar
                    </Button>
                  )}
                  {canSendMessages && item.status === 'published' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void status(item, 'archived')}
                    >
                      <Archive /> Arquivar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="xl:col-span-2">
            <CardContent className="py-16 text-center">
              <Megaphone className="text-muted-foreground mx-auto mb-3 size-9" />
              <p className="font-medium">Ainda não existem campanhas.</p>
            </CardContent>
          </Card>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar campanha' : 'Nova campanha'}
            </DialogTitle>
            <DialogDescription>
              A campanha só aparece aos clientes depois de publicada.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 p-4">
              <p className="flex items-center gap-2 font-semibold text-violet-900">
                <Sparkles className="size-4" /> Uma oferta que merece atenção
              </p>
              <p className="mt-1 text-xs leading-5 text-violet-700">
                Dê um título emocional, mostre o benefício concreto e mantenha
                as condições simples. A campanha nasce como rascunho para ser
                revista antes da publicação.
              </p>
            </div>
            <Input
              placeholder="Título"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <Input
              placeholder="Resumo curto"
              value={draft.summary}
              onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
            />
            <Textarea
              placeholder="Descrição completa"
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
            <Input
              placeholder="Benefício (ex.: 20% de desconto)"
              value={draft.benefitText}
              onChange={(e) =>
                setDraft({ ...draft, benefitText: e.target.value })
              }
            />
            <label className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <input type="checkbox" checked={draft.commerceEnabled} onChange={(event) => setDraft({ ...draft, commerceEnabled: event.target.checked })} />
              <span><strong>Venda online com SumUp</strong><br /><span className="text-xs text-emerald-800">Cria uma venda e checkout para o cliente pagar no Portal.</span></span>
            </label>
            {draft.commerceEnabled && (
              <Input type="number" min="0.01" step="0.01" placeholder="Preço da oferta (€)" value={draft.commercePrice} onChange={(event) => setDraft({ ...draft, commercePrice: event.target.value })} />
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Selo: Exclusivo"
                value={draft.badgeText}
                onChange={(e) =>
                  setDraft({ ...draft, badgeText: e.target.value })
                }
              />
              <div className="flex gap-2">
                <Input
                  placeholder="URL da imagem ou carregue um ficheiro"
                  value={draft.imageUrl}
                  onChange={(e) =>
                    setDraft({ ...draft, imageUrl: e.target.value })
                  }
                />
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(event) => {
                    void uploadCampaignImage(event.target.files?.[0]);
                    event.currentTarget.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploadingImage}
                >
                  {uploadingImage ? <Loader2 className="animate-spin" /> : <Upload />}
                  Carregar
                </Button>
              </div>
              <p className="text-muted-foreground text-xs sm:col-span-2">
                Tamanho recomendado: <strong>1500 × 500 px</strong> (proporção
                3:1). Use JPG ou WebP, até 5 MB, e mantenha textos/logótipos
                na zona central para não serem cortados em ecrãs pequenos.
              </p>
              <Input
                type="datetime-local"
                value={draft.startsAt}
                onChange={(e) =>
                  setDraft({ ...draft, startsAt: e.target.value })
                }
              />
              <Input
                type="datetime-local"
                value={draft.endsAt}
                onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })}
              />
              <Input
                type="number"
                min="1"
                placeholder="Limite de vagas (opcional)"
                value={draft.capacity}
                onChange={(e) =>
                  setDraft({ ...draft, capacity: e.target.value })
                }
              />
              <p className="text-muted-foreground flex items-start gap-1 text-xs sm:col-span-2">
                <Clock3 className="mt-0.5 size-3.5 shrink-0" />
                O fim inclui uma hora exata. Depois desse momento, a campanha
                deixa automaticamente de aparecer no Portal 360.
              </p>
            </div>
            <Textarea
              placeholder="Termos e condições"
              value={draft.terms}
              onChange={(e) => setDraft({ ...draft, terms: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving && <Loader2 className="animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CampaignMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Megaphone;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl">
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-2xl leading-none font-semibold">{value}</p>
          <p className="text-muted-foreground mt-1 text-xs">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
