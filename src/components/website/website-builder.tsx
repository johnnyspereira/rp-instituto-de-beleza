'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ExternalLink,
  Globe2,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
  UsersRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  PublicSiteSettings,
  SiteBenefit,
  SiteFaq,
  SitePlan,
  SiteTestimonial,
} from '@/lib/public-site/types';
import {
  getPublicSiteTheme,
  PUBLIC_SITE_THEMES,
} from '@/lib/public-site/themes';
import {
  MEDIA_MAX_BYTES_BY_KIND,
  uploadAccountMedia,
} from '@/lib/storage/upload-media';
type Lead = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  subject: string | null;
  message: string;
  status: string;
  created_at: string;
  contact_id: string | null;
};
type GoogleConnection = {
  connected: boolean;
  connectedAt: string | null;
  googleAccountName: string | null;
};
const DEFAULTS: Omit<PublicSiteSettings, 'account_id'> = {
  slug: '',
  enabled: false,
  site_theme: 'wellness',
  primary_color: '#2563eb',
  accent_color: '#0f172a',
  hero_badge: 'Bem-vindo',
  hero_title: 'Cuidado, qualidade e confiança',
  hero_subtitle:
    'Conheça os nossos serviços e descubra uma experiência pensada para você.',
  hero_image_url: null,
  about_title: 'Sobre nós',
  about_text:
    'Conte aqui quem é a sua empresa, o que faz e por que os clientes confiam no seu trabalho.',
  history_text: null,
  mission_text: null,
  contact_email: null,
  contact_phone: null,
  whatsapp_phone: null,
  address: null,
  opening_hours: null,
  instagram_url: null,
  facebook_url: null,
  linkedin_url: null,
  show_services: true,
  show_team: true,
  show_plans: true,
  show_benefits: true,
  show_testimonials: true,
  google_reviews_enabled: false,
  google_place_id: null,
  google_review_url: null,
  show_faq: true,
  show_booking: true,
  plans: [],
  benefits: [
    {
      title: 'Atendimento personalizado',
      description:
        'Uma experiência próxima, organizada e centrada em cada cliente.',
    },
  ],
  testimonials: [],
  faqs: [],
  seo_title: null,
  seo_description: null,
};
const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
export function WebsiteBuilder() {
  const { accountId, account, canEditSettings } = useAuth();
  const db = useMemo(() => createClient(), []);
  const [form, setForm] =
      useState<Omit<PublicSiteSettings, 'account_id'>>(DEFAULTS),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [uploadingHero, setUploadingHero] = useState(false),
    [schemaMissing, setSchemaMissing] = useState(false),
    [leads, setLeads] = useState<Lead[]>([]),
    [googleConnection, setGoogleConnection] = useState<GoogleConnection | null>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!accountId) return;
    Promise.all([
      db
        .from('public_site_settings')
        .select('*')
        .eq('account_id', accountId)
        .maybeSingle(),
      db
        .from('public_site_leads')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]).then(([siteResult, leadResult]) => {
      if (siteResult.error) {
        setSchemaMissing(
          siteResult.error.code === '42P01' ||
            siteResult.error.message.includes('schema cache')
        );
      } else if (siteResult.data) setForm({ ...DEFAULTS, ...siteResult.data });
      else
        setForm({
          ...DEFAULTS,
          slug: `${slugify(account?.name || 'empresa')}-${accountId.replaceAll('-', '').slice(0, 6)}`,
          hero_title: `Bem-vindo à ${account?.name || 'nossa empresa'}`,
        });
      if (!leadResult.error) setLeads((leadResult.data ?? []) as Lead[]);
      setLoading(false);
    });
  }, [account?.name, accountId, db]);
  useEffect(() => {
    const google = new URLSearchParams(window.location.search).get('google');
    const reason = new URLSearchParams(window.location.search).get('reason');
    if (google === 'connected') toast.success('Conta Google ligada com sucesso.');
    if (google === 'missing-config') toast.error('Faltam as credenciais Google no cPanel.');
    if (google === 'failed') toast.error(reason === 'state' ? 'A sessão de autorização expirou. Tente ligar novamente.' : reason === 'session' ? 'A sessão do CRM expirou. Entre novamente e tente.' : reason === 'token' ? 'A Google recusou a troca do código. Verifique Client ID, Secret e callback.' : reason === 'encryption' ? 'Falta ou é inválida a ENCRYPTION_KEY no cPanel.' : 'Não foi possível guardar a ligação. Confirme que o deploy aplicou as migrations.');
    if (google) window.history.replaceState({}, '', '/website');
  }, []);
  useEffect(() => {
    if (!accountId) return;
    fetch('/api/integrations/google/status')
      .then((response) => response.ok ? response.json() : null)
      .then((connection: GoogleConnection | null) => setGoogleConnection(connection))
      .catch(() => setGoogleConnection(null));
  }, [accountId]);
  function patch<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  async function uploadHeroImage(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Use uma imagem JPG, PNG ou WebP.');
      return;
    }
    if (file.size > MEDIA_MAX_BYTES_BY_KIND.image) {
      toast.error('A imagem não pode ultrapassar 5 MB.');
      return;
    }
    setUploadingHero(true);
    try {
      const { publicUrl } = await uploadAccountMedia('chat-media', file);
      patch('hero_image_url', publicUrl);
      toast.success('Imagem principal carregada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar a imagem.');
    } finally {
      setUploadingHero(false);
    }
  }
  async function save() {
    if (!accountId || !canEditSettings) return;
    const slug = slugify(form.slug);
    if (slug.length < 3)
      return toast.error('Escolha um endereço com pelo menos 3 caracteres.');
    if (!form.hero_title.trim())
      return toast.error('Informe o título principal.');
    setSaving(true);
    const { error } = await db.from('public_site_settings').upsert({
      ...form,
      account_id: accountId,
      slug,
      hero_title: form.hero_title.trim(),
      about_title: form.about_title.trim() || 'Sobre nós',
    });
    setSaving(false);
    if (error)
      return toast.error(
        error.code === '23505' ? 'Este endereço já está em uso.' : error.message
      );
    patch('slug', slug);
    toast.success('Site público atualizado.');
  }
  const siteUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : '/';
  if (loading)
    return (
      <div className="flex min-h-96 items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (schemaMissing)
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
        <h2 className="font-semibold">Módulo ainda não instalado</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Aplique a migration 082_public_business_sites.sql para ativar o
          construtor.
        </p>
      </div>
    );
  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-primary flex items-center gap-2 text-sm font-medium">
            <Globe2 className="size-4" />
            PRESENÇA DIGITAL
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Site público</h1>
          <p className="text-muted-foreground mt-1">
            Apresente a empresa, serviços e planos e transforme visitantes em
            clientes.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!form.slug}
            onClick={() => window.open(siteUrl, '_blank')}
          >
            <ExternalLink />
            Visualizar
          </Button>
          <Button
            onClick={() => void save()}
            disabled={saving || !canEditSettings}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Save />}Guardar e
            publicar
          </Button>
        </div>
      </header>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Tabs defaultValue="identity">
          <TabsList className="max-w-full overflow-x-auto">
            <TabsTrigger value="identity">Identidade</TabsTrigger>
            <TabsTrigger value="content">Empresa</TabsTrigger>
            <TabsTrigger value="offers">Planos e benefícios</TabsTrigger>
            <TabsTrigger value="social">Prova social</TabsTrigger>
            <TabsTrigger value="contact">Contacto e SEO</TabsTrigger>
            <TabsTrigger value="leads">Leads ({leads.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="identity" className="pt-5">
            <Panel
              title="Publicação e identidade"
              description="Defina o endereço, aparência e primeira impressão do site."
            >
              <Toggle
                label="Site publicado"
                description="Quando desligado, visitantes verão uma página indisponível."
                checked={form.enabled}
                onChange={(v) => patch('enabled', v)}
              />
              <div>
                <Label>Estilo do site</Label>
                <p className="text-muted-foreground mt-1 text-xs">
                  Escolha uma direção visual adequada ao posicionamento da
                  empresa.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {PUBLIC_SITE_THEMES.map((theme) => (
                    <button
                      type="button"
                      key={theme.id}
                      onClick={() => {
                        patch('site_theme', theme.id);
                        patch('primary_color', theme.primary);
                        patch('accent_color', theme.accent);
                      }}
                      className={`overflow-hidden rounded-xl border-2 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                        form.site_theme === theme.id
                          ? 'border-primary ring-primary/20 ring-4'
                          : 'border-border'
                      }`}
                    >
                      <div
                        className={`h-20 bg-gradient-to-br ${theme.preview}`}
                      >
                        <div className="flex h-full items-end gap-1 p-3">
                          <span className="h-7 w-16 rounded bg-white/90 shadow-sm" />
                          <span className="h-7 w-7 rounded-full bg-white/50" />
                        </div>
                      </div>
                      <div className="bg-card p-3">
                        <p className="font-semibold">{theme.name}</p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {theme.description}
                        </p>
                        <p className="text-muted-foreground mt-2 text-[10px] tracking-wide uppercase">
                          {theme.industries}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <Field
                label="Identificador interno do site"
                value={form.slug}
                onChange={(v) => patch('slug', slugify(v))}
                prefix="site/"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <ColorField
                  label="Cor principal"
                  value={form.primary_color}
                  onChange={(v) => patch('primary_color', v)}
                />
                <ColorField
                  label="Cor escura"
                  value={form.accent_color}
                  onChange={(v) => patch('accent_color', v)}
                />
              </div>
              <Field
                label="Texto de destaque"
                value={form.hero_badge ?? ''}
                onChange={(v) => patch('hero_badge', v || null)}
              />
              <Field
                label="Título principal"
                value={form.hero_title}
                onChange={(v) => patch('hero_title', v)}
              />
              <TextField
                label="Subtítulo"
                value={form.hero_subtitle ?? ''}
                onChange={(v) => patch('hero_subtitle', v || null)}
              />
              <div>
                <Label>Imagem principal</Label>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={form.hero_image_url ?? ''}
                    onChange={(event) => patch('hero_image_url', event.target.value || null)}
                    placeholder="Cole uma URL ou carregue uma imagem"
                  />
                  <input
                    ref={heroInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      void uploadHeroImage(event.target.files?.[0]);
                      event.currentTarget.value = '';
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={uploadingHero}
                    onClick={() => heroInputRef.current?.click()}
                  >
                    {uploadingHero ? <Loader2 className="animate-spin" /> : <Upload />}
                    Carregar
                  </Button>
                </div>
                <p className="text-muted-foreground mt-2 text-xs">
                  Tema Spa editorial: recomendado 2400 × 1600 px (3:2), JPG ou WebP, até 5 MB.
                </p>
              </div>
            </Panel>
          </TabsContent>
          <TabsContent value="content" className="pt-5">
            <Panel
              title="Quem é a empresa"
              description="Conte a história de forma humana e convincente."
            >
              <Field
                label="Título da seção"
                value={form.about_title}
                onChange={(v) => patch('about_title', v)}
              />
              <TextField
                label="Apresentação"
                value={form.about_text ?? ''}
                onChange={(v) => patch('about_text', v || null)}
              />
              <TextField
                label="Nossa história"
                value={form.history_text ?? ''}
                onChange={(v) => patch('history_text', v || null)}
              />
              <TextField
                label="Missão e valores"
                value={form.mission_text ?? ''}
                onChange={(v) => patch('mission_text', v || null)}
              />
              <Toggle
                label="Mostrar serviços"
                description="Usa os serviços ativos cadastrados na clínica."
                checked={form.show_services}
                onChange={(v) => patch('show_services', v)}
              />
              <Toggle
                label="Mostrar profissionais"
                description="Usa os profissionais visíveis online."
                checked={form.show_team}
                onChange={(v) => patch('show_team', v)}
              />
              <Toggle
                label="Permitir agendamento"
                description="Direciona o visitante ao Portal 360."
                checked={form.show_booking}
                onChange={(v) => patch('show_booking', v)}
              />
            </Panel>
          </TabsContent>
          <TabsContent value="offers" className="space-y-5 pt-5">
            <ArrayPanel
              title="Planos"
              enabled={form.show_plans}
              onEnabled={(v) => patch('show_plans', v)}
              onAdd={() =>
                patch('plans', [
                  ...form.plans,
                  {
                    name: 'Novo plano',
                    price: 'Sob consulta',
                    description: '',
                    features: [],
                  },
                ])
              }
            >
              {form.plans.map((item, index) => (
                <PlanEditor
                  key={index}
                  item={item}
                  onChange={(value) =>
                    patch('plans', replaceAt(form.plans, index, value))
                  }
                  onRemove={() => patch('plans', removeAt(form.plans, index))}
                />
              ))}
            </ArrayPanel>
            <ArrayPanel
              title="Benefícios e diferenciais"
              enabled={form.show_benefits}
              onEnabled={(v) => patch('show_benefits', v)}
              onAdd={() =>
                patch('benefits', [
                  ...form.benefits,
                  { title: 'Novo benefício', description: '' },
                ])
              }
            >
              {form.benefits.map((item, index) => (
                <SimpleEditor
                  key={index}
                  item={item}
                  onChange={(value) =>
                    patch('benefits', replaceAt(form.benefits, index, value))
                  }
                  onRemove={() =>
                    patch('benefits', removeAt(form.benefits, index))
                  }
                />
              ))}
            </ArrayPanel>
          </TabsContent>
          <TabsContent value="social" className="space-y-5 pt-5">
            <Panel title="Avaliações Google" description="Ligue o Perfil de Empresa Google, importe as avaliações e publique apenas as que aprovar no CRM.">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${googleConnection?.connected ? 'bg-emerald-500/10 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                  {googleConnection?.connected ? '● Conta Google ligada' : '○ Conta Google não ligada'}
                </span>
                {googleConnection?.connectedAt && <span className="text-muted-foreground text-xs">Ligada em {new Date(googleConnection.connectedAt).toLocaleDateString('pt-PT')}</span>}
              </div>
              {googleConnection?.connected && !googleConnection.googleAccountName && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">A conta está ligada, mas ainda não foi encontrado um Perfil de Empresa Google. Confirme que esta conta é proprietária ou gestora do perfil da empresa no Google Business Profile.</div>}
              <div className="flex flex-wrap gap-2"><Button type="button" variant={googleConnection?.connected ? 'secondary' : 'outline'} onClick={() => { window.location.href = '/api/integrations/google/start'; }}>{googleConnection?.connected ? 'Trocar conta Google' : 'Ligar conta Google'}</Button><Button type="button" variant="secondary" disabled={!googleConnection?.connected} onClick={async () => { const response = await fetch('/api/integrations/google/sync', { method: 'POST' }); const payload = await response.json(); if (!response.ok) return toast.error(payload.error || 'Falha ao atualizar.'); setGoogleConnection((current) => current ? { ...current, googleAccountName: 'Perfil Google sincronizado' } : current); toast.success(`${payload.imported} avaliações Google atualizadas.`); }}>Atualizar reviews agora</Button></div>
              <Toggle label="Mostrar avaliações Google aprovadas" description="As avaliações importadas não aparecem no site até serem aprovadas em Marketing → Avaliações." checked={form.google_reviews_enabled} onChange={(value) => patch('google_reviews_enabled', value)} />
              <Field label="Link para avaliar no Google" value={form.google_review_url ?? ''} onChange={(value) => patch('google_review_url', value.trim() || null)} placeholder="https://g.page/r/.../review" />
              <p className="text-muted-foreground text-xs">Esta ligação usa a sua conta Google; não precisa de Google Place ID nem de uma chave de API paga.</p>
            </Panel>
            <ArrayPanel
              title="Depoimentos"
              enabled={form.show_testimonials}
              onEnabled={(v) => patch('show_testimonials', v)}
              onAdd={() =>
                patch('testimonials', [
                  ...form.testimonials,
                  { name: 'Cliente', role: '', quote: '' },
                ])
              }
            >
              {form.testimonials.map((item, index) => (
                <TestimonialEditor
                  key={index}
                  item={item}
                  onChange={(value) =>
                    patch(
                      'testimonials',
                      replaceAt(form.testimonials, index, value)
                    )
                  }
                  onRemove={() =>
                    patch('testimonials', removeAt(form.testimonials, index))
                  }
                />
              ))}
            </ArrayPanel>
            <ArrayPanel
              title="Perguntas frequentes"
              enabled={form.show_faq}
              onEnabled={(v) => patch('show_faq', v)}
              onAdd={() =>
                patch('faqs', [
                  ...form.faqs,
                  { question: 'Nova pergunta', answer: '' },
                ])
              }
            >
              {form.faqs.map((item, index) => (
                <FaqEditor
                  key={index}
                  item={item}
                  onChange={(value) =>
                    patch('faqs', replaceAt(form.faqs, index, value))
                  }
                  onRemove={() => patch('faqs', removeAt(form.faqs, index))}
                />
              ))}
            </ArrayPanel>
          </TabsContent>
          <TabsContent value="contact" className="pt-5">
            <Panel
              title="Contacto, redes e pesquisa"
              description="Informações exibidas no rodapé e usadas pelos motores de pesquisa."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Email"
                  value={form.contact_email ?? ''}
                  onChange={(v) => patch('contact_email', v || null)}
                />
                <Field
                  label="Telefone"
                  value={form.contact_phone ?? ''}
                  onChange={(v) => patch('contact_phone', v || null)}
                />
                <Field
                  label="WhatsApp"
                  value={form.whatsapp_phone ?? ''}
                  onChange={(v) => patch('whatsapp_phone', v || null)}
                />
                <Field
                  label="Horário"
                  value={form.opening_hours ?? ''}
                  onChange={(v) => patch('opening_hours', v || null)}
                />
              </div>
              <TextField
                label="Morada"
                value={form.address ?? ''}
                onChange={(v) => patch('address', v || null)}
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  label="Instagram"
                  value={form.instagram_url ?? ''}
                  onChange={(v) => patch('instagram_url', v || null)}
                />
                <Field
                  label="Facebook"
                  value={form.facebook_url ?? ''}
                  onChange={(v) => patch('facebook_url', v || null)}
                />
                <Field
                  label="LinkedIn"
                  value={form.linkedin_url ?? ''}
                  onChange={(v) => patch('linkedin_url', v || null)}
                />
              </div>
              <Field
                label="Título SEO"
                value={form.seo_title ?? ''}
                onChange={(v) => patch('seo_title', v || null)}
              />
              <TextField
                label="Descrição SEO"
                value={form.seo_description ?? ''}
                onChange={(v) => patch('seo_description', v || null)}
              />
            </Panel>
          </TabsContent>
          <TabsContent value="leads" className="pt-5">
            <Panel
              title="Contactos recebidos"
              description="Pedidos enviados pelo site e já ligados ao CRM."
            >
              {leads.length ? (
                leads.map((lead) => (
                  <div key={lead.id} className="rounded-xl border p-4">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <p className="font-semibold">{lead.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {lead.phone}
                          {lead.email ? ` · ${lead.email}` : ''}
                        </p>
                      </div>
                      <span className="rounded-full bg-blue-500/10 px-2 py-1 text-xs text-blue-600">
                        {lead.status === 'new' ? 'Novo' : lead.status}
                      </span>
                    </div>
                    {lead.subject && (
                      <p className="mt-3 text-sm font-medium">{lead.subject}</p>
                    )}
                    <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
                      {lead.message}
                    </p>
                    <p className="text-muted-foreground mt-3 text-xs">
                      {new Date(lead.created_at).toLocaleString('pt-PT')}
                      {lead.contact_id ? ' · Contacto criado no CRM' : ''}
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-muted-foreground py-10 text-center">
                  <UsersRound className="mx-auto mb-2 opacity-40" />
                  Nenhum contacto recebido.
                </div>
              )}
            </Panel>
          </TabsContent>
        </Tabs>
        <SitePreview form={form} accountName={account?.name || 'Sua empresa'} />
      </div>
    </div>
  );
}
function SitePreview({
  form,
  accountName,
}: {
  form: Omit<PublicSiteSettings, 'account_id'>;
  accountName: string;
}) {
  const theme = getPublicSiteTheme(form.site_theme);
  return (
    <aside
      data-site-theme={form.site_theme}
      className="sticky top-5 hidden overflow-hidden rounded-2xl border bg-white shadow-xl xl:block"
    >
      <div className="bg-slate-100 px-4 py-2 text-center text-[10px] font-medium text-slate-500">
        PRÉ-VISUALIZAÇÃO
      </div>
      <div
        style={
          {
            '--site-primary': form.primary_color,
            '--site-dark': form.accent_color,
          } as React.CSSProperties
        }
        className="text-slate-900"
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <b>{accountName}</b>
            <p className="text-[9px] text-slate-400">Tema {theme.name}</p>
          </div>
          <span className="text-xs text-slate-500">
            Serviços · Sobre · Contacto
          </span>
        </div>
        <div className="bg-[var(--site-dark)] px-6 py-12 text-white">
          <span className="rounded-full bg-white/10 px-3 py-1 text-[10px]">
            {form.hero_badge || 'Bem-vindo'}
          </span>
          <h2 className="mt-4 text-3xl leading-tight font-semibold">
            {form.hero_title}
          </h2>
          <p className="mt-3 text-sm leading-6 text-white/70">
            {form.hero_subtitle}
          </p>
          <button className="mt-5 rounded-lg bg-[var(--site-primary)] px-4 py-2 text-xs font-semibold">
            Conhecer serviços
          </button>
        </div>
        <div className="p-6">
          <p className="text-xs font-medium text-[var(--site-primary)]">
            SOBRE
          </p>
          <h3 className="mt-2 text-xl font-semibold">{form.about_title}</h3>
          <p className="mt-2 line-clamp-4 text-sm leading-6 text-slate-500">
            {form.about_text}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2">
            {form.benefits.slice(0, 4).map((item, index) => (
              <div key={index} className="rounded-lg bg-slate-50 p-3">
                <b className="text-xs">{item.title}</b>
                <p className="mt-1 line-clamp-2 text-[10px] text-slate-500">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card space-y-5 rounded-2xl border p-5 md:p-6">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>
      {children}
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  placeholder,
  prefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  prefix?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex">
        {prefix && (
          <span className="bg-muted text-muted-foreground flex items-center rounded-l-md border border-r-0 px-3 text-sm">
            {prefix}
          </span>
        )}
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={prefix ? 'rounded-l-none' : ''}
        />
      </div>
    </div>
  );
}
function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-24"
      />
    </div>
  );
}
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-14 p-1"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}
function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
function ArrayPanel({
  title,
  enabled,
  onEnabled,
  onAdd,
  children,
}: {
  title: string;
  enabled: boolean;
  onEnabled: (v: boolean) => void;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <Panel
      title={title}
      description="Adicione, edite e organize o conteúdo exibido no site."
    >
      <Toggle
        label={`Mostrar ${title.toLowerCase()}`}
        description="Controle a visibilidade desta seção."
        checked={enabled}
        onChange={onEnabled}
      />
      {children}
      <Button variant="outline" onClick={onAdd}>
        <Plus />
        Adicionar
      </Button>
    </Panel>
  );
}
const replaceAt = <T,>(items: T[], index: number, value: T) =>
  items.map((item, i) => (i === index ? value : item));
const removeAt = <T,>(items: T[], index: number) =>
  items.filter((_, i) => i !== index);
function EditorShell({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove: () => void;
}) {
  return (
    <div className="relative space-y-3 rounded-xl border p-4 pr-14">
      {children}
      <Button
        variant="ghost"
        size="icon"
        className="text-destructive absolute top-2 right-2"
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </div>
  );
}
function SimpleEditor({
  item,
  onChange,
  onRemove,
}: {
  item: SiteBenefit;
  onChange: (v: SiteBenefit) => void;
  onRemove: () => void;
}) {
  return (
    <EditorShell onRemove={onRemove}>
      <Field
        label="Título"
        value={item.title}
        onChange={(v) => onChange({ ...item, title: v })}
      />
      <TextField
        label="Descrição"
        value={item.description}
        onChange={(v) => onChange({ ...item, description: v })}
      />
    </EditorShell>
  );
}
function PlanEditor({
  item,
  onChange,
  onRemove,
}: {
  item: SitePlan;
  onChange: (v: SitePlan) => void;
  onRemove: () => void;
}) {
  return (
    <EditorShell onRemove={onRemove}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Nome"
          value={item.name}
          onChange={(v) => onChange({ ...item, name: v })}
        />
        <Field
          label="Preço"
          value={item.price}
          onChange={(v) => onChange({ ...item, price: v })}
        />
      </div>
      <TextField
        label="Descrição"
        value={item.description}
        onChange={(v) => onChange({ ...item, description: v })}
      />
      <TextField
        label="Recursos (um por linha)"
        value={item.features.join('\n')}
        onChange={(v) =>
          onChange({ ...item, features: v.split('\n').filter(Boolean) })
        }
      />
      <Toggle
        label="Destacar plano"
        description="Aplica maior destaque visual."
        checked={item.highlighted === true}
        onChange={(v) => onChange({ ...item, highlighted: v })}
      />
    </EditorShell>
  );
}
function TestimonialEditor({
  item,
  onChange,
  onRemove,
}: {
  item: SiteTestimonial;
  onChange: (v: SiteTestimonial) => void;
  onRemove: () => void;
}) {
  return (
    <EditorShell onRemove={onRemove}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Nome"
          value={item.name}
          onChange={(v) => onChange({ ...item, name: v })}
        />
        <Field
          label="Identificação"
          value={item.role}
          onChange={(v) => onChange({ ...item, role: v })}
        />
      </div>
      <TextField
        label="Depoimento"
        value={item.quote}
        onChange={(v) => onChange({ ...item, quote: v })}
      />
    </EditorShell>
  );
}
function FaqEditor({
  item,
  onChange,
  onRemove,
}: {
  item: SiteFaq;
  onChange: (v: SiteFaq) => void;
  onRemove: () => void;
}) {
  return (
    <EditorShell onRemove={onRemove}>
      <Field
        label="Pergunta"
        value={item.question}
        onChange={(v) => onChange({ ...item, question: v })}
      />
      <TextField
        label="Resposta"
        value={item.answer}
        onChange={(v) => onChange({ ...item, answer: v })}
      />
    </EditorShell>
  );
}
