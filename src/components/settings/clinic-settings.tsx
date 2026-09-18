'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Boxes,
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Clock3,
  Copy,
  Download,
  DoorOpen,
  Globe2,
  ExternalLink,
  Loader2,
  MessageCircle,
  PackagePlus,
  PackageCheck,
  Pencil,
  Percent,
  Plus,
  Printer,
  Save,
  Scissors,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import {
  DEFAULT_ANAMNESIS_CONFIG,
  mergeAnamnesisConfig,
  type AnamnesisFormConfig,
  type AnamnesisQuestion,
} from '@/lib/clinic/anamnesis-config';
import { formatCurrency } from '@/lib/currency';
import {
  parseServiceCsv,
  serviceImportGrossPrice,
  type ServiceImportRow,
} from '@/lib/clinic/service-import';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type {
  AccountMember,
  ClinicProduct,
  ClinicRoom,
  ClinicService,
} from '@/types';
import { SettingsPanelHead } from './settings-panel-head';
import { PackCatalogSettings } from './pack-catalog-settings';

type CatalogTab =
  | 'services'
  | 'products'
  | 'packs'
  | 'rooms'
  | 'professionals'
  | 'communication'
  | 'anamnesis';

type AnamnesisFormRow = {
  id: string;
  public_token: string;
  status: string;
  client_name: string | null;
  client_email: string | null;
  submitted_at: string | null;
  created_at: string;
  contact_id: string | null;
  selected_modalities: string[];
  answers: Record<string, unknown>;
  signature_name: string | null;
  service?: { name?: string } | null;
};

type CommunicationDraft = {
  clinic_address: string;
  directions: string;
  parking_info: string;
  payment_methods: string;
  anamnesis_intro: string;
  confirmation_reminder_hours: number;
  auto_send_confirmation: boolean;
  auto_send_pending_reminder: boolean;
  benefit_expiry_reminder_days: number;
  auto_send_benefit_expiry_reminder: boolean;
  anamnesis_enabled: boolean;
  anamnesis_public_slug: string;
  anamnesis_title: string;
  anamnesis_form_config: AnamnesisFormConfig;
};

const DEFAULT_COMMUNICATION: CommunicationDraft = {
  clinic_address: '',
  directions: '',
  parking_info: '',
  payment_methods: 'MB Way ou numerário',
  anamnesis_intro:
    'O preenchimento é rápido e confidencial e ajuda-nos a personalizar o atendimento com segurança.',
  confirmation_reminder_hours: 24,
  auto_send_confirmation: true,
  auto_send_pending_reminder: true,
  benefit_expiry_reminder_days: 7,
  auto_send_benefit_expiry_reminder: true,
  anamnesis_enabled: true,
  anamnesis_public_slug: '',
  anamnesis_title: 'Ficha de anamnese',
  anamnesis_form_config: DEFAULT_ANAMNESIS_CONFIG,
};

type ServiceDraft = {
  name: string;
  reference: string;
  category: string;
  description: string;
  publicPresentation: string;
  publicBenefits: string;
  publicConsiderations: string;
  publicImageUrl: string;
  durationMinutes: string;
  price: string;
  color: string;
  onlineEnabled: boolean;
  showOnSite: boolean;
  internalBookingEnabled: boolean;
  comingSoon: boolean;
  ivaEnabled: boolean;
  commissionsEnabled: boolean;
  collaboratorsEnabled: boolean;
  personalizeEnabled: boolean;
  detailsEnabled: boolean;
  commissionExecutantPercent: string;
  commissionResponsiblePercent: string;
};

type ProductDraft = {
  name: string;
  description: string;
  sku: string;
  price: string;
  stockQuantity: string;
};

type RoomDraft = {
  name: string;
  description: string;
  color: string;
};

type WorkDayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

type WorkDayConfig = {
  enabled: boolean;
  start: string;
  breakStart: string;
  breakEnd: string;
  end: string;
};

type WorkingHours = Record<WorkDayKey, WorkDayConfig>;

type ProfessionalWorkSession = {
  id: string;
  user_id: string;
  work_date: string;
  status: string;
  started_at: string | null;
  last_active_at: string | null;
  closed_at: string | null;
  absence_reason?: string | null;
};

const COLORS = [
  '#7c3aed',
  '#0ea5e9',
  '#14b8a6',
  '#22c55e',
  '#f59e0b',
  '#f97316',
  '#ec4899',
  '#ef4444',
];

function defaultServiceDraft(): ServiceDraft {
  return {
    name: '',
    reference: '',
    category: 'Massagem',
    description: '',
    publicPresentation: '',
    publicBenefits: '',
    publicConsiderations: '',
    publicImageUrl: '',
    durationMinutes: '60',
    price: '',
    color: COLORS[0],
    onlineEnabled: true,
    showOnSite: true,
    internalBookingEnabled: true,
    comingSoon: false,
    ivaEnabled: false,
    commissionsEnabled: false,
    collaboratorsEnabled: true,
    personalizeEnabled: false,
    detailsEnabled: true,
    commissionExecutantPercent: '0',
    commissionResponsiblePercent: '0',
  };
}

function serviceDraftFromService(service: ClinicService): ServiceDraft {
  return {
    name: service.name ?? '',
    reference: service.reference ?? '',
    category: service.category ?? 'Massagem',
    description: service.description ?? '',
    publicPresentation: service.public_presentation ?? '',
    publicBenefits: (service.public_benefits ?? []).join('\n'),
    publicConsiderations: (service.public_considerations ?? []).join('\n'),
    publicImageUrl: service.public_image_url ?? '',
    durationMinutes: String(service.duration_minutes ?? 60),
    price: String(service.price ?? ''),
    color: service.color ?? COLORS[0],
    onlineEnabled: service.online_enabled ?? true,
    showOnSite: service.show_on_site ?? true,
    internalBookingEnabled: service.internal_booking_enabled ?? true,
    comingSoon: service.coming_soon ?? false,
    ivaEnabled: service.iva_enabled ?? false,
    commissionsEnabled: service.commissions_enabled ?? false,
    collaboratorsEnabled: service.collaborators_enabled ?? true,
    personalizeEnabled: service.personalize_enabled ?? false,
    detailsEnabled: service.details_enabled ?? true,
    commissionExecutantPercent: String(
      service.commission_executant_percent ?? 0
    ),
    commissionResponsiblePercent: String(
      service.commission_responsible_percent ?? 0
    ),
  };
}

function defaultProductDraft(): ProductDraft {
  return {
    name: '',
    description: '',
    sku: '',
    price: '',
    stockQuantity: '0',
  };
}

function productDraftFromProduct(product: ClinicProduct): ProductDraft {
  return {
    name: product.name ?? '',
    description: product.description ?? '',
    sku: product.sku ?? '',
    price: String(product.price ?? ''),
    stockQuantity: String(product.stock_quantity ?? 0),
  };
}

function defaultRoomDraft(): RoomDraft {
  return {
    name: '',
    description: '',
    color: COLORS[1],
  };
}

function roomDraftFromRoom(room: ClinicRoom): RoomDraft {
  return {
    name: room.name ?? '',
    description: room.description ?? '',
    color: room.color ?? COLORS[1],
  };
}

function readNumber(value: string, fallback: number) {
  const parsed = Number(value.replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

const WEEK_DAYS: Array<{ key: WorkDayKey; label: string }> = [
  { key: 'mon', label: '2ª feira' },
  { key: 'tue', label: '3ª feira' },
  { key: 'wed', label: '4ª feira' },
  { key: 'thu', label: '5ª feira' },
  { key: 'fri', label: '6ª feira' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
];

function defaultWorkingHours(): WorkingHours {
  return WEEK_DAYS.reduce((acc, day) => {
    acc[day.key] = {
      enabled: day.key !== 'sun',
      start: day.key === 'mon' ? '09:00' : '11:00',
      breakStart: '13:00',
      breakEnd: '14:00',
      end: day.key === 'sun' ? '21:00' : '22:00',
    };
    return acc;
  }, {} as WorkingHours);
}

function normalizeWorkingHours(value: unknown): WorkingHours {
  const defaults = defaultWorkingHours();
  if (!value || typeof value !== 'object') return defaults;

  const source = value as Partial<Record<WorkDayKey, Partial<WorkDayConfig>>>;
  return WEEK_DAYS.reduce((acc, day) => {
    const row = source[day.key] ?? {};
    acc[day.key] = {
      enabled:
        typeof row.enabled === 'boolean'
          ? row.enabled
          : defaults[day.key].enabled,
      start:
        typeof row.start === 'string' ? row.start : defaults[day.key].start,
      breakStart:
        typeof row.breakStart === 'string'
          ? row.breakStart
          : defaults[day.key].breakStart,
      breakEnd:
        typeof row.breakEnd === 'string'
          ? row.breakEnd
          : defaults[day.key].breakEnd,
      end: typeof row.end === 'string' ? row.end : defaults[day.key].end,
    };
    return acc;
  }, {} as WorkingHours);
}

function isMissingClinicSchema(error: { code?: string; message?: string }) {
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.message?.includes('clinic_services') ||
    error.message?.includes('clinic_products') ||
    error.message?.includes('clinic_rooms') ||
    error.message?.includes('reference') ||
    error.message?.includes('working_hours')
  );
}

export function ClinicSettings() {
  const supabase = useMemo(() => createClient(), []);
  const { accountId, user, defaultCurrency, canEditSettings, profileLoading } =
    useAuth();

  const [tab, setTab] = useState<CatalogTab>('services');
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [services, setServices] = useState<ClinicService[]>([]);
  const [products, setProducts] = useState<ClinicProduct[]>([]);
  const [rooms, setRooms] = useState<ClinicRoom[]>([]);
  const [professionals, setProfessionals] = useState<AccountMember[]>([]);
  const [professionalWorkSessions, setProfessionalWorkSessions] = useState<
    Record<string, ProfessionalWorkSession[]>
  >({});
  const [saving, setSaving] = useState(false);
  const [uploadingServiceImage, setUploadingServiceImage] = useState(false);
  const serviceImageInputRef = useRef<HTMLInputElement>(null);
  const [communication, setCommunication] = useState<CommunicationDraft>(
    DEFAULT_COMMUNICATION
  );
  const [anamnesisForms, setAnamnesisForms] = useState<AnamnesisFormRow[]>([]);

  const [serviceOpen, setServiceOpen] = useState(false);
  const [serviceImportOpen, setServiceImportOpen] = useState(false);
  const [serviceImportRows, setServiceImportRows] = useState<
    ServiceImportRow[]
  >([]);
  const [serviceImportErrors, setServiceImportErrors] = useState<string[]>([]);
  const [serviceImportFileName, setServiceImportFileName] = useState('');
  const [serviceImportDuration, setServiceImportDuration] = useState('60');
  const [importingServices, setImportingServices] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [serviceDraft, setServiceDraft] = useState<ServiceDraft>(() =>
    defaultServiceDraft()
  );
  const [productDraft, setProductDraft] = useState<ProductDraft>(() =>
    defaultProductDraft()
  );
  const [roomDraft, setRoomDraft] = useState<RoomDraft>(() =>
    defaultRoomDraft()
  );

  const loadCatalog = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setSchemaMissing(false);

    const [
      servicesRes,
      productsRes,
      roomsRes,
      membersRes,
      communicationRes,
      anamnesisRes,
    ] = await Promise.all([
      supabase
        .from('clinic_services')
        .select('*')
        .eq('account_id', accountId)
        .order('is_active', { ascending: false })
        .order('name'),
      supabase
        .from('clinic_products')
        .select('*')
        .eq('account_id', accountId)
        .order('is_active', { ascending: false })
        .order('name'),
      supabase
        .from('clinic_rooms')
        .select('*')
        .eq('account_id', accountId)
        .order('is_active', { ascending: false })
        .order('name'),
      canEditSettings
        ? fetch('/api/account/members', { cache: 'no-store' })
            .then(async (response) =>
              response.ok
                ? ((await response.json()) as { members?: AccountMember[] })
                : null
            )
            .catch(() => null)
        : Promise.resolve(null),
      supabase
        .from('clinic_communication_settings')
        .select('*')
        .eq('account_id', accountId)
        .maybeSingle(),
      supabase
        .from('clinic_anamnesis_forms')
        .select(
          'id,public_token,status,client_name,client_email,submitted_at,created_at,contact_id,selected_modalities,answers,signature_name,service:clinic_services(name)'
        )
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    const firstError =
      servicesRes.error ??
      productsRes.error ??
      roomsRes.error ??
      communicationRes.error ??
      anamnesisRes.error ??
      null;
    if (firstError) {
      if (isMissingClinicSchema(firstError)) {
        setSchemaMissing(true);
      } else {
        toast.error(`Falha ao carregar catálogo: ${firstError.message}`);
      }
      setLoading(false);
      return;
    }

    setServices((servicesRes.data ?? []) as ClinicService[]);
    setProducts((productsRes.data ?? []) as ClinicProduct[]);
    setRooms((roomsRes.data ?? []) as ClinicRoom[]);
    setProfessionals(membersRes?.members ?? []);
    setAnamnesisForms(
      (anamnesisRes.data ?? []) as unknown as AnamnesisFormRow[]
    );
    if (communicationRes.data) {
      const stored = communicationRes.data as Partial<CommunicationDraft>;
      setCommunication({
        ...DEFAULT_COMMUNICATION,
        ...stored,
        anamnesis_form_config: mergeAnamnesisConfig(
          stored.anamnesis_form_config
        ),
      });
    }
    setLoading(false);
  }, [accountId, canEditSettings, supabase]);

  useEffect(() => {
    if (profileLoading) return;
    const timer = window.setTimeout(() => {
      void loadCatalog();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCatalog, profileLoading]);

  useEffect(() => {
    if (!accountId || !canEditSettings || professionals.length === 0) {
      return;
    }
    const userIds = professionals.map((member) => member.user_id);
    let cancelled = false;

    async function loadProfessionalWorkSessions() {
      const { data, error } = await supabase
        .from('work_sessions')
        .select(
          'id, user_id, work_date, status, started_at, last_active_at, closed_at, absence_reason'
        )
        .eq('account_id', accountId)
        .in('user_id', userIds)
        .order('work_date', { ascending: false })
        .limit(Math.max(10, userIds.length * 5));

      if (cancelled) return;
      if (error) {
        setProfessionalWorkSessions({});
        return;
      }

      const grouped: Record<string, ProfessionalWorkSession[]> = {};
      for (const row of (data ?? []) as ProfessionalWorkSession[]) {
        const list = grouped[row.user_id] ?? [];
        if (list.length < 5) list.push(row);
        grouped[row.user_id] = list;
      }
      setProfessionalWorkSessions(grouped);
    }

    void loadProfessionalWorkSessions();
    return () => {
      cancelled = true;
    };
  }, [accountId, canEditSettings, professionals, supabase]);

  function openCreateForTab() {
    if (tab === 'services') {
      setEditingServiceId(null);
      setServiceDraft(defaultServiceDraft());
      setServiceOpen(true);
    } else if (tab === 'products') {
      setEditingProductId(null);
      setProductDraft(defaultProductDraft());
      setProductOpen(true);
    } else {
      setEditingRoomId(null);
      setRoomDraft(defaultRoomDraft());
      setRoomOpen(true);
    }
  }

  function openEditService(service: ClinicService) {
    setEditingServiceId(service.id);
    setServiceDraft(serviceDraftFromService(service));
    setServiceOpen(true);
  }

  async function uploadServiceImage(file?: File) {
    if (!file || !accountId) return;
    if (!file.type.startsWith('image/')) return toast.error('Selecione uma imagem válida.');
    if (file.size > 5 * 1024 * 1024) return toast.error('A imagem deve ter no máximo 5 MB.');
    setUploadingServiceImage(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `account-${accountId}/services/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('branding-assets').upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from('branding-assets').getPublicUrl(path);
      setServiceDraft((previous) => ({ ...previous, publicImageUrl: data.publicUrl }));
      toast.success('Imagem carregada. Guarde o procedimento para publicar.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar a imagem.');
    } finally { setUploadingServiceImage(false); }
  }

  async function saveService() {
    if (!accountId || !user?.id) return;
    const name = serviceDraft.name.trim();
    if (!name) {
      toast.error('Informe o nome do procedimento.');
      return;
    }

    setSaving(true);
    const payload = {
      name,
      reference: serviceDraft.reference.trim() || null,
      category: serviceDraft.category.trim() || null,
      description: serviceDraft.description.trim() || null,
      public_presentation: serviceDraft.publicPresentation.trim() || null,
      public_benefits: serviceDraft.publicBenefits.split('\n').map((value) => value.trim()).filter(Boolean),
      public_considerations: serviceDraft.publicConsiderations.split('\n').map((value) => value.trim()).filter(Boolean),
      public_image_url: serviceDraft.publicImageUrl.trim() || null,
      duration_minutes: Math.max(
        5,
        Math.round(readNumber(serviceDraft.durationMinutes, 60))
      ),
      price: Math.max(0, readNumber(serviceDraft.price, 0)),
      currency: defaultCurrency,
      color: serviceDraft.color,
      online_enabled: serviceDraft.onlineEnabled,
      show_on_site: serviceDraft.showOnSite,
      internal_booking_enabled: serviceDraft.internalBookingEnabled,
      coming_soon: serviceDraft.comingSoon,
      iva_enabled: serviceDraft.ivaEnabled,
      commissions_enabled: serviceDraft.commissionsEnabled,
      collaborators_enabled: serviceDraft.collaboratorsEnabled,
      personalize_enabled: serviceDraft.personalizeEnabled,
      details_enabled: serviceDraft.detailsEnabled,
      commission_executant_percent: Math.max(
        0,
        readNumber(serviceDraft.commissionExecutantPercent, 0)
      ),
      commission_responsible_percent: Math.max(
        0,
        readNumber(serviceDraft.commissionResponsiblePercent, 0)
      ),
    };
    const { error } = editingServiceId
      ? await supabase
          .from('clinic_services')
          .update(payload)
          .eq('id', editingServiceId)
          .eq('account_id', accountId)
      : await supabase.from('clinic_services').insert({
          account_id: accountId,
          user_id: user.id,
          ...payload,
          is_active: true,
        });
    setSaving(false);

    if (error) {
      toast.error(
        `Falha ao ${editingServiceId ? 'editar' : 'criar'} procedimento: ${
          error.message
        }`
      );
      return;
    }
    toast.success(
      editingServiceId ? 'Procedimento atualizado.' : 'Procedimento criado.'
    );
    setServiceOpen(false);
    setEditingServiceId(null);
    void loadCatalog();
  }

  async function prepareServiceImport(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      let content = new TextDecoder('utf-8').decode(buffer);
      if (content.includes('\uFFFD')) {
        content = new TextDecoder('windows-1252').decode(buffer);
      }
      const parsed = parseServiceCsv(content);
      if (!parsed.rows.length) {
        toast.error(parsed.errors[0] || 'Nenhum serviço válido encontrado.');
        return;
      }
      setServiceImportRows(parsed.rows);
      setServiceImportErrors(parsed.errors);
      setServiceImportFileName(file.name);
      setServiceImportDuration('60');
      setServiceImportOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Não foi possível ler o CSV: ${error.message}`
          : 'Não foi possível ler o CSV.'
      );
    }
  }

  async function importServices() {
    if (!accountId || !user?.id || !canEditSettings) return;
    const fallbackDuration = Math.max(
      5,
      Math.round(readNumber(serviceImportDuration, 60))
    );
    const byReference = new Map(
      services
        .filter((service) => service.reference)
        .map((service) => [service.reference!.trim().toLowerCase(), service])
    );
    const byName = new Map(
      services.map((service) => [normalizeServiceName(service.name), service])
    );
    let created = 0;
    let updated = 0;
    const failures: string[] = [];
    setImportingServices(true);

    for (const row of serviceImportRows) {
      const existing =
        (row.reference
          ? byReference.get(row.reference.trim().toLowerCase())
          : undefined) || byName.get(normalizeServiceName(row.name));
      const payload = {
        name: row.name,
        reference: row.reference || existing?.reference || null,
        description: row.description || null,
        category: row.category || 'Genérico',
        duration_minutes: row.durationMinutes || fallbackDuration,
        price: serviceImportGrossPrice(row),
        currency: defaultCurrency,
        color: existing?.color || '#7c3aed',
        online_enabled: row.onlineEnabled,
        iva_enabled: row.taxRate > 0,
        commissions_enabled:
          row.commissionExecutantPercent > 0 ||
          row.commissionResponsiblePercent > 0,
        collaborators_enabled: true,
        personalize_enabled: false,
        details_enabled: true,
        commission_executant_percent: row.commissionExecutantPercent,
        commission_responsible_percent: row.commissionResponsiblePercent,
        is_active: row.active,
      };

      if (existing) {
        const { error } = await supabase
          .from('clinic_services')
          .update(payload)
          .eq('id', existing.id)
          .eq('account_id', accountId);
        if (error) failures.push(`${row.name}: ${error.message}`);
        else updated += 1;
        continue;
      }

      const { data, error } = await supabase
        .from('clinic_services')
        .insert({
          account_id: accountId,
          user_id: user.id,
          ...payload,
        })
        .select('*')
        .single();
      if (error || !data) {
        failures.push(`${row.name}: ${error?.message || 'falha ao criar'}`);
      } else {
        const createdService = data as ClinicService;
        created += 1;
        byName.set(normalizeServiceName(createdService.name), createdService);
        if (createdService.reference) {
          byReference.set(
            createdService.reference.trim().toLowerCase(),
            createdService
          );
        }
      }
    }

    setImportingServices(false);
    if (failures.length) {
      toast.error(
        `${failures.length} serviço(s) não foram importados. ${failures[0]}`
      );
    }
    if (created || updated) {
      toast.success(
        `Importação concluída: ${created} criado(s) e ${updated} atualizado(s).`
      );
      setServiceImportOpen(false);
      void loadCatalog();
    }
  }

  function openEditProduct(product: ClinicProduct) {
    setEditingProductId(product.id);
    setProductDraft(productDraftFromProduct(product));
    setProductOpen(true);
  }

  async function saveProduct() {
    if (!accountId || !user?.id) return;
    const name = productDraft.name.trim();
    if (!name) {
      toast.error('Informe o nome do produto.');
      return;
    }

    setSaving(true);
    const payload = {
      name,
      description: productDraft.description.trim() || null,
      sku: productDraft.sku.trim() || null,
      price: Math.max(0, readNumber(productDraft.price, 0)),
      currency: defaultCurrency,
      stock_quantity: Math.max(
        0,
        Math.round(readNumber(productDraft.stockQuantity, 0))
      ),
    };
    const { error } = editingProductId
      ? await supabase
          .from('clinic_products')
          .update(payload)
          .eq('id', editingProductId)
          .eq('account_id', accountId)
      : await supabase.from('clinic_products').insert({
          account_id: accountId,
          user_id: user.id,
          ...payload,
          is_active: true,
        });
    setSaving(false);

    if (error) {
      toast.error(
        `Falha ao ${editingProductId ? 'editar' : 'criar'} produto: ${
          error.message
        }`
      );
      return;
    }
    toast.success(editingProductId ? 'Produto atualizado.' : 'Produto criado.');
    setProductOpen(false);
    setEditingProductId(null);
    void loadCatalog();
  }

  function openEditRoom(room: ClinicRoom) {
    setEditingRoomId(room.id);
    setRoomDraft(roomDraftFromRoom(room));
    setRoomOpen(true);
  }

  async function saveRoom() {
    if (!accountId || !user?.id) return;
    const name = roomDraft.name.trim();
    if (!name) {
      toast.error('Informe o nome da sala.');
      return;
    }

    setSaving(true);
    const payload = {
      name,
      description: roomDraft.description.trim() || null,
      color: roomDraft.color,
    };
    const { error } = editingRoomId
      ? await supabase
          .from('clinic_rooms')
          .update(payload)
          .eq('id', editingRoomId)
          .eq('account_id', accountId)
      : await supabase.from('clinic_rooms').insert({
          account_id: accountId,
          user_id: user.id,
          ...payload,
          is_active: true,
        });
    setSaving(false);

    if (error) {
      toast.error(
        `Falha ao ${editingRoomId ? 'editar' : 'criar'} sala: ${error.message}`
      );
      return;
    }
    toast.success(editingRoomId ? 'Sala atualizada.' : 'Sala criada.');
    setRoomOpen(false);
    setEditingRoomId(null);
    void loadCatalog();
  }

  async function toggleActive(
    table: 'clinic_services' | 'clinic_products' | 'clinic_rooms',
    id: string,
    isActive: boolean
  ) {
    if (!accountId) return;
    const { error } = await supabase
      .from(table)
      .update({ is_active: !isActive })
      .eq('id', id)
      .eq('account_id', accountId);
    if (error) {
      toast.error(`Falha ao atualizar: ${error.message}`);
      return;
    }
    void loadCatalog();
  }

  function updateProfessional(userId: string, patch: Partial<AccountMember>) {
    setProfessionals((prev) =>
      prev.map((member) =>
        member.user_id === userId ? { ...member, ...patch } : member
      )
    );
  }

  async function saveProfessional(member: AccountMember) {
    if (!canEditSettings) return;
    setSaving(true);
    const response = await fetch(`/api/account/members/${member.user_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        professional: {
          is_professional: Boolean(member.is_professional),
          title: member.professional_title ?? '',
          color: member.professional_color ?? COLORS[0],
          bio: member.professional_bio ?? '',
          phone: member.professional_phone ?? '',
          public_slug: member.professional_public_slug ?? '',
          show_online: member.professional_show_online ?? true,
          commission_executant_percent:
            member.commission_executant_percent ?? 0,
          commission_responsible_percent:
            member.commission_responsible_percent ?? 0,
          working_hours: normalizeWorkingHours(member.working_hours),
          online_booking_blocked: member.online_booking_blocked ?? false,
        },
      }),
    });
    setSaving(false);

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) {
      toast.error(payload.error || 'Falha ao guardar profissional.');
      return;
    }
    toast.success('Profissional guardado.');
    void loadCatalog();
  }

  const actionLabel =
    tab === 'services'
      ? 'Novo procedimento'
      : tab === 'products'
        ? 'Novo produto'
        : 'Nova sala';

  async function saveCommunication() {
    if (!accountId || !canEditSettings) return;
    const anamnesisSlug = communication.anamnesis_public_slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (anamnesisSlug.length < 3) {
      toast.error(
        'Defina um endereço público de anamnese com pelo menos 3 caracteres.'
      );
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('clinic_communication_settings')
      .upsert({
        account_id: accountId,
        ...communication,
        anamnesis_public_slug: anamnesisSlug,
        confirmation_reminder_hours: Math.max(
          1,
          Math.min(168, Number(communication.confirmation_reminder_hours) || 24)
        ),
        benefit_expiry_reminder_days: Math.max(
          1,
          Math.min(90, Number(communication.benefit_expiry_reminder_days) || 7)
        ),
      });
    setSaving(false);
    if (error)
      return toast.error(`Falha ao guardar comunicação: ${error.message}`);
    setCommunication((current) => ({
      ...current,
      anamnesis_public_slug: anamnesisSlug,
    }));
    toast.success('Comunicação da agenda atualizada.');
  }

  return (
    <section className="animate-in fade-in-50 space-y-5 duration-200">
      <SettingsPanelHead
        title="Clínica"
        description="Configure o catálogo operacional fora da agenda: procedimentos, produtos e salas usadas nos atendimentos."
        action={
          canEditSettings &&
          tab !== 'professionals' &&
          tab !== 'packs' &&
          tab !== 'communication' &&
          tab !== 'anamnesis' ? (
            <Button onClick={openCreateForTab}>
              <Plus className="size-4" />
              {actionLabel}
            </Button>
          ) : null
        }
      />

      {schemaMissing ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-5 text-sm text-amber-700 dark:text-amber-300">
            Aplique as migrations <code>046_clinic_resources.sql</code> e{' '}
            <code>048_clinic_backoffice_polish.sql</code> no Supabase para
            ativar produtos, salas, serviços avançados e profissionais.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <ClinicMetric
          icon={<Scissors className="size-4" />}
          label="Procedimentos"
          value={services.length}
          detail={`${services.filter((item) => item.is_active).length} ativos`}
        />
        <ClinicMetric
          icon={<Boxes className="size-4" />}
          label="Produtos"
          value={products.length}
          detail={`${products.filter((item) => item.is_active).length} ativos`}
        />
        <ClinicMetric
          icon={<DoorOpen className="size-4" />}
          label="Salas"
          value={rooms.length}
          detail={`${rooms.filter((item) => item.is_active).length} ativas`}
        />
        <ClinicMetric
          icon={<Users className="size-4" />}
          label="Profissionais"
          value={professionals.filter((item) => item.is_professional).length}
          detail={`${professionals.length} membros na equipa`}
        />
      </div>

      <div className="border-border bg-card rounded-lg border">
        <div className="border-border flex flex-wrap gap-2 border-b p-3">
          <CatalogTabButton
            active={tab === 'services'}
            onClick={() => setTab('services')}
          >
            <Scissors className="size-4" />
            Procedimentos
          </CatalogTabButton>
          <CatalogTabButton
            active={tab === 'communication'}
            onClick={() => setTab('communication')}
          >
            <MessageCircle className="size-4" />
            Comunicação
          </CatalogTabButton>
          <CatalogTabButton
            active={tab === 'anamnesis'}
            onClick={() => setTab('anamnesis')}
          >
            <ClipboardList className="size-4" />
            Anamnese
          </CatalogTabButton>
          <CatalogTabButton
            active={tab === 'products'}
            onClick={() => setTab('products')}
          >
            <PackagePlus className="size-4" />
            Produtos
          </CatalogTabButton>
          <CatalogTabButton
            active={tab === 'packs'}
            onClick={() => setTab('packs')}
          >
            <PackageCheck className="size-4" />
            Packs
          </CatalogTabButton>
          <CatalogTabButton
            active={tab === 'rooms'}
            onClick={() => setTab('rooms')}
          >
            <Building2 className="size-4" />
            Salas
          </CatalogTabButton>
          <CatalogTabButton
            active={tab === 'professionals'}
            onClick={() => setTab('professionals')}
          >
            <Users className="size-4" />
            Profissionais
          </CatalogTabButton>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="text-primary size-6 animate-spin" />
            </div>
          ) : tab === 'services' ? (
            <ServiceList
              services={services}
              currency={defaultCurrency}
              canImport={canEditSettings}
              onImport={(file) => void prepareServiceImport(file)}
              onEdit={openEditService}
              onToggle={(item) =>
                toggleActive('clinic_services', item.id, item.is_active)
              }
            />
          ) : tab === 'products' ? (
            <ProductList
              products={products}
              currency={defaultCurrency}
              onEdit={openEditProduct}
              onToggle={(item) =>
                toggleActive('clinic_products', item.id, item.is_active)
              }
            />
          ) : tab === 'packs' ? (
            <PackCatalogSettings />
          ) : tab === 'rooms' ? (
            <RoomList
              rooms={rooms}
              onEdit={openEditRoom}
              onToggle={(item) =>
                toggleActive('clinic_rooms', item.id, item.is_active)
              }
            />
          ) : tab === 'professionals' ? (
            <ProfessionalsPanel
              members={professionals}
              workSessionsByUser={professionalWorkSessions}
              canEdit={canEditSettings}
              saving={saving}
              onChange={updateProfessional}
              onSave={saveProfessional}
            />
          ) : tab === 'communication' ? (
            <CommunicationPanel
              value={communication}
              disabled={!canEditSettings}
              saving={saving}
              onChange={setCommunication}
              onSave={() => void saveCommunication()}
            />
          ) : (
            <AnamnesisPanel
              value={communication}
              forms={anamnesisForms}
              disabled={!canEditSettings}
              saving={saving}
              onChange={setCommunication}
              onSave={() => void saveCommunication()}
            />
          )}
        </div>
      </div>

      <Dialog
        open={serviceOpen}
        onOpenChange={(open) => {
          setServiceOpen(open);
          if (!open) setEditingServiceId(null);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editingServiceId ? 'Editar procedimento' : 'Novo procedimento'}
            </DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="general" className="min-h-[480px]">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="general">Geral</TabsTrigger>
              <TabsTrigger value="operation">Operação</TabsTrigger>
              <TabsTrigger value="public">Site público</TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="mt-4 grid gap-4">
            <Field label="Nome">
              <Input
                value={serviceDraft.name}
                onChange={(event) =>
                  setServiceDraft((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                placeholder="Ex: Massagem relaxante"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Ref.">
                <Input
                  value={serviceDraft.reference}
                  onChange={(event) =>
                    setServiceDraft((prev) => ({
                      ...prev,
                      reference: event.target.value,
                    }))
                  }
                  placeholder="Automática se ficar em branco"
                />
              </Field>
              <Field label="Categoria">
                <Input
                  value={serviceDraft.category}
                  onChange={(event) =>
                    setServiceDraft((prev) => ({
                      ...prev,
                      category: event.target.value,
                    }))
                  }
                  placeholder="Ex: Massagem"
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Duração em minutos">
                <Input
                  type="number"
                  min={5}
                  value={serviceDraft.durationMinutes}
                  onChange={(event) =>
                    setServiceDraft((prev) => ({
                      ...prev,
                      durationMinutes: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label={`Preço (${defaultCurrency})`}>
                <Input
                  inputMode="decimal"
                  value={serviceDraft.price}
                  onChange={(event) =>
                    setServiceDraft((prev) => ({
                      ...prev,
                      price: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>
            <ColorPicker
              value={serviceDraft.color}
              onChange={(color) =>
                setServiceDraft((prev) => ({ ...prev, color }))
              }
            />
            </TabsContent>
            <TabsContent value="operation" className="mt-4 grid gap-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <ServiceOption
                label="Opções online"
                checked={serviceDraft.onlineEnabled}
                onChange={(checked) =>
                  setServiceDraft((prev) => ({
                    ...prev,
                    onlineEnabled: checked,
                  }))
                }
              />
              <ServiceOption
                label="Exibir no site público"
                checked={serviceDraft.showOnSite}
                onChange={(checked) =>
                  setServiceDraft((prev) => ({ ...prev, showOnSite: checked }))
                }
              />
              <ServiceOption
                label="Permitir agendamento CRM/Portal"
                checked={serviceDraft.internalBookingEnabled}
                onChange={(checked) =>
                  setServiceDraft((prev) => ({
                    ...prev,
                    internalBookingEnabled: checked,
                  }))
                }
              />
              <ServiceOption
                label="Em breve"
                checked={serviceDraft.comingSoon}
                onChange={(checked) =>
                  setServiceDraft((prev) => ({ ...prev, comingSoon: checked }))
                }
              />
              <ServiceOption
                label="IVA"
                checked={serviceDraft.ivaEnabled}
                onChange={(checked) =>
                  setServiceDraft((prev) => ({
                    ...prev,
                    ivaEnabled: checked,
                  }))
                }
              />
              <ServiceOption
                label="Comissões"
                checked={serviceDraft.commissionsEnabled}
                onChange={(checked) =>
                  setServiceDraft((prev) => ({
                    ...prev,
                    commissionsEnabled: checked,
                  }))
                }
              />
              <ServiceOption
                label="Colaboradores"
                checked={serviceDraft.collaboratorsEnabled}
                onChange={(checked) =>
                  setServiceDraft((prev) => ({
                    ...prev,
                    collaboratorsEnabled: checked,
                  }))
                }
              />
              <ServiceOption
                label="Personalizar"
                checked={serviceDraft.personalizeEnabled}
                onChange={(checked) =>
                  setServiceDraft((prev) => ({
                    ...prev,
                    personalizeEnabled: checked,
                  }))
                }
              />
              <ServiceOption
                label="Detalhes"
                checked={serviceDraft.detailsEnabled}
                onChange={(checked) =>
                  setServiceDraft((prev) => ({
                    ...prev,
                    detailsEnabled: checked,
                  }))
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Comissão executante (%)">
                <Input
                  inputMode="decimal"
                  value={serviceDraft.commissionExecutantPercent}
                  onChange={(event) =>
                    setServiceDraft((prev) => ({
                      ...prev,
                      commissionExecutantPercent: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Comissão responsável (%)">
                <Input
                  inputMode="decimal"
                  value={serviceDraft.commissionResponsiblePercent}
                  onChange={(event) =>
                    setServiceDraft((prev) => ({
                      ...prev,
                      commissionResponsiblePercent: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>
            <Field label="Descrição">
              <Textarea
                value={serviceDraft.description}
                onChange={(event) =>
                  setServiceDraft((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
              />
            </Field>
            </TabsContent>
            <TabsContent value="public" className="mt-4">
            <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
              <div className="mb-4">
                <p className="font-semibold">Apresentação no site público</p>
                <p className="text-muted-foreground text-xs">Aparece quando o visitante clicar na modalidade. Nos campos abaixo, use uma informação por linha.</p>
              </div>
              <div className="grid gap-3">
                <Field label="Imagem (URL)">
                  <div className="flex gap-2"><Input value={serviceDraft.publicImageUrl} onChange={(event) => setServiceDraft((prev) => ({ ...prev, publicImageUrl: event.target.value }))} placeholder="Cole uma URL ou carregue um ficheiro" /><input ref={serviceImageInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => { void uploadServiceImage(event.target.files?.[0]); event.currentTarget.value = ''; }} /><Button type="button" variant="outline" onClick={() => serviceImageInputRef.current?.click()} disabled={uploadingServiceImage}>{uploadingServiceImage ? <Loader2 className="animate-spin" /> : <Upload />} Carregar</Button></div>
                </Field>
                <Field label="Apresentação completa">
                  <Textarea value={serviceDraft.publicPresentation} onChange={(event) => setServiceDraft((prev) => ({ ...prev, publicPresentation: event.target.value }))} placeholder="Explique a experiência, para quem é indicada e como funciona a sessão." />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Benefícios (um por linha)">
                    <Textarea value={serviceDraft.publicBenefits} onChange={(event) => setServiceDraft((prev) => ({ ...prev, publicBenefits: event.target.value }))} placeholder={'Relaxamento profundo\nAlívio da tensão muscular\nMelhoria do bem-estar'} />
                  </Field>
                  <Field label="Cuidados / contraindicações (um por linha)">
                    <Textarea value={serviceDraft.publicConsiderations} onChange={(event) => setServiceDraft((prev) => ({ ...prev, publicConsiderations: event.target.value }))} placeholder={'Informe-nos sobre gravidez\nEvitar em caso de febre\nAvise sobre lesões recentes'} />
                  </Field>
                </div>
              </div>
            </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setServiceOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveService} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {editingServiceId ? 'Guardar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={serviceImportOpen} onOpenChange={setServiceImportOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Importar procedimentos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 grid gap-3 rounded-md p-4 sm:grid-cols-3">
              <ImportMetric label="Ficheiro" value={serviceImportFileName} />
              <ImportMetric
                label="Linhas válidas"
                value={String(serviceImportRows.length)}
              />
              <ImportMetric
                label="Com IVA no ficheiro"
                value={String(
                  serviceImportRows.filter((row) => row.taxRate > 0).length
                )}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-[220px_1fr] sm:items-end">
              <Field label="Duração padrão quando ausente">
                <div className="relative">
                  <Input
                    type="number"
                    min={5}
                    step={5}
                    value={serviceImportDuration}
                    onChange={(event) =>
                      setServiceImportDuration(event.target.value)
                    }
                  />
                  <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs">
                    minutos
                  </span>
                </div>
              </Field>
              <p className="text-muted-foreground text-xs leading-5">
                A referência identifica serviços existentes. Quando ela já
                existir, nome, preço, categoria, IVA e comissões serão
                atualizados. O preço líquido de `unit_price` recebe o IVA do CSV
                antes de ser guardado.
              </p>
            </div>

            {serviceImportErrors.length ? (
              <div className="border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {serviceImportErrors.length} linha(s) ignoradas.{' '}
                {serviceImportErrors.slice(0, 2).join(' ')}
              </div>
            ) : null}

            <div className="border-border max-h-80 overflow-auto rounded-md border">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Ref.</th>
                    <th className="px-3 py-2 text-left">Procedimento</th>
                    <th className="px-3 py-2 text-left">Categoria</th>
                    <th className="px-3 py-2 text-right">Preço final</th>
                    <th className="px-3 py-2 text-right">Comissões</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceImportRows.slice(0, 50).map((row) => (
                    <tr
                      key={`${row.rowNumber}-${row.reference}-${row.name}`}
                      className="border-border border-t"
                    >
                      <td className="text-muted-foreground px-3 py-2">
                        {row.reference || 'Automática'}
                      </td>
                      <td className="px-3 py-2 font-medium">{row.name}</td>
                      <td className="px-3 py-2">{row.category}</td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrency(
                          serviceImportGrossPrice(row),
                          defaultCurrency
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.commissionExecutantPercent}% /{' '}
                        {row.commissionResponsiblePercent}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {serviceImportRows.length > 50 ? (
              <p className="text-muted-foreground text-xs">
                Pré-visualização das primeiras 50 linhas. Todas as{' '}
                {serviceImportRows.length} linhas válidas serão processadas.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setServiceImportOpen(false)}
              disabled={importingServices}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void importServices()}
              disabled={importingServices || !serviceImportRows.length}
            >
              {importingServices ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Upload />
              )}
              Importar {serviceImportRows.length} procedimentos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={productOpen}
        onOpenChange={(open) => {
          setProductOpen(open);
          if (!open) setEditingProductId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingProductId ? 'Editar produto' : 'Novo produto'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Nome">
              <Input
                value={productDraft.name}
                onChange={(event) =>
                  setProductDraft((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                placeholder="Ex: Óleo relaxante"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="SKU">
                <Input
                  value={productDraft.sku}
                  onChange={(event) =>
                    setProductDraft((prev) => ({
                      ...prev,
                      sku: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label={`Preço (${defaultCurrency})`}>
                <Input
                  inputMode="decimal"
                  value={productDraft.price}
                  onChange={(event) =>
                    setProductDraft((prev) => ({
                      ...prev,
                      price: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Stock">
                <Input
                  type="number"
                  min={0}
                  value={productDraft.stockQuantity}
                  onChange={(event) =>
                    setProductDraft((prev) => ({
                      ...prev,
                      stockQuantity: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>
            <Field label="Descrição">
              <Textarea
                value={productDraft.description}
                onChange={(event) =>
                  setProductDraft((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveProduct} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {editingProductId ? 'Guardar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={roomOpen}
        onOpenChange={(open) => {
          setRoomOpen(open);
          if (!open) setEditingRoomId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRoomId ? 'Editar sala' : 'Nova sala'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Nome">
              <Input
                value={roomDraft.name}
                onChange={(event) =>
                  setRoomDraft((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                placeholder="Ex: Sala 1"
              />
            </Field>
            <ColorPicker
              value={roomDraft.color}
              onChange={(color) => setRoomDraft((prev) => ({ ...prev, color }))}
            />
            <Field label="Descrição">
              <Textarea
                value={roomDraft.description}
                onChange={(event) =>
                  setRoomDraft((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoomOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveRoom} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {editingRoomId ? 'Guardar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ClinicMetric({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <Card className="rounded-lg" size="sm">
      <CardContent className="flex items-center gap-3">
        <span className="bg-primary-soft text-primary flex size-9 items-center justify-center rounded-md">
          {icon}
        </span>
        <div>
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="text-foreground text-xl font-semibold">{value}</p>
          <p className="text-muted-foreground text-xs">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CommunicationPanel({
  value,
  disabled,
  saving,
  onChange,
  onSave,
}: {
  value: CommunicationDraft;
  disabled: boolean;
  saving: boolean;
  onChange: (value: CommunicationDraft) => void;
  onSave: () => void;
}) {
  const patch = <K extends keyof CommunicationDraft>(
    key: K,
    next: CommunicationDraft[K]
  ) => onChange({ ...value, [key]: next });
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold">Mensagens automáticas da agenda</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Dados usados na confirmação, no lembrete pendente e no convite para a
          ficha de anamnese.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Morada da clínica">
          <Input
            value={value.clinic_address}
            onChange={(event) => patch('clinic_address', event.target.value)}
            disabled={disabled}
          />
        </Field>
        <Field label="Transportes e acesso">
          <Input
            value={value.directions}
            onChange={(event) => patch('directions', event.target.value)}
            disabled={disabled}
          />
        </Field>
        <Field label="Estacionamento">
          <Input
            value={value.parking_info}
            onChange={(event) => patch('parking_info', event.target.value)}
            disabled={disabled}
          />
        </Field>
        <Field label="Métodos de pagamento">
          <Input
            value={value.payment_methods}
            onChange={(event) => patch('payment_methods', event.target.value)}
            disabled={disabled}
          />
        </Field>
        <Field label="Lembrar confirmação após (horas)">
          <Input
            type="number"
            min="1"
            max="168"
            value={value.confirmation_reminder_hours}
            onChange={(event) =>
              patch('confirmation_reminder_hours', Number(event.target.value))
            }
            disabled={disabled}
          />
        </Field>
        <Field label="Avisar validade de voucher/pack (dias antes)">
          <Input
            type="number"
            min="1"
            max="90"
            value={value.benefit_expiry_reminder_days}
            onChange={(event) =>
              patch('benefit_expiry_reminder_days', Number(event.target.value))
            }
            disabled={disabled}
          />
        </Field>
        <div className="space-y-2">
          <ToggleLine
            label="Enviar confirmação ao criar marcação"
            checked={value.auto_send_confirmation}
            onChange={(checked) => patch('auto_send_confirmation', checked)}
            disabled={disabled}
          />
          <ToggleLine
            label="Relembrar confirmações pendentes"
            checked={value.auto_send_pending_reminder}
            onChange={(checked) => patch('auto_send_pending_reminder', checked)}
            disabled={disabled}
          />
          <ToggleLine
            label="Avisar quando voucher ou pack estiver perto de expirar"
            checked={value.auto_send_benefit_expiry_reminder}
            onChange={(checked) =>
              patch('auto_send_benefit_expiry_reminder', checked)
            }
            disabled={disabled}
          />
        </div>
      </div>
      <Field label="Texto de apoio à anamnese">
        <Textarea
          value={value.anamnesis_intro}
          onChange={(event) => patch('anamnesis_intro', event.target.value)}
          disabled={disabled}
          rows={3}
        />
      </Field>
      <div className="bg-muted/40 rounded-md p-4 text-sm leading-6">
        <strong>Pré-visualização do conteúdo</strong>
        <p className="text-muted-foreground mt-1">
          A mensagem inclui automaticamente cliente, modalidade, data, hora,
          valor, profissional, confirmação por palavra-chave e o link exclusivo
          da anamnese.
        </p>
      </div>
      <div className="flex justify-end">
        <Button onClick={onSave} disabled={disabled || saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Guardar comunicação
        </Button>
      </div>
    </div>
  );
}

function AnamnesisPanel({
  value,
  forms,
  disabled,
  saving,
  onChange,
  onSave,
}: {
  value: CommunicationDraft;
  forms: AnamnesisFormRow[];
  disabled: boolean;
  saving: boolean;
  onChange: (value: CommunicationDraft) => void;
  onSave: () => void;
}) {
  const config = value.anamnesis_form_config || DEFAULT_ANAMNESIS_CONFIG;
  const publicUrl =
    typeof window === 'undefined' || !value.anamnesis_public_slug
      ? ''
      : `${window.location.origin}/anamnese`;
  function patch(next: Partial<CommunicationDraft>) {
    onChange({ ...value, ...next });
  }
  function patchConfig(next: Partial<AnamnesisFormConfig>) {
    patch({ anamnesis_form_config: { ...config, ...next } });
  }
  function addQuestion() {
    patchConfig({
      customQuestions: [
        ...(config.customQuestions || []),
        {
          id: `question_${Date.now()}`,
          label: 'Nova pergunta',
          type: 'textarea',
          required: false,
        },
      ],
    });
  }
  function updateModality(
    index: number,
    updater: (
      modality: AnamnesisFormConfig['modalities'][number]
    ) => AnamnesisFormConfig['modalities'][number]
  ) {
    patchConfig({
      modalities: config.modalities.map((item, itemIndex) =>
        itemIndex === index ? updater(item) : item
      ),
    });
  }
  function addModalityQuestion(index: number) {
    updateModality(index, (modality) => ({
      ...modality,
      questions: [
        ...(modality.questions || []),
        {
          id: `${modality.id}_${Date.now()}`,
          label: 'Nova pergunta clínica',
          type: 'textarea',
          required: false,
        },
      ],
    }));
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Anamnese clínica</h3>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Configure o formulário público, acompanhe respostas e mantenha uma
            ficha específica para cada modalidade e marcação.
          </p>
        </div>
        <ToggleLine
          label="Formulário público ativo"
          checked={value.anamnesis_enabled}
          onChange={(checked) => patch({ anamnesis_enabled: checked })}
          disabled={disabled}
        />
      </div>

      <section className="border-border rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <Globe2 className="text-primary size-4" />
          <h4 className="font-semibold">Link externo permanente</h4>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(220px,0.45fr)_minmax(0,1fr)_auto_auto]">
          <Input
            value={value.anamnesis_public_slug}
            onChange={(event) =>
              patch({ anamnesis_public_slug: event.target.value })
            }
            disabled={disabled}
            placeholder="anamnese-clinica"
          />
          <Input
            value={publicUrl}
            readOnly
            placeholder="Guarde para gerar o link"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="Copiar link"
            disabled={!publicUrl}
            onClick={() => {
              void navigator.clipboard.writeText(publicUrl);
              toast.success('Link da anamnese copiado.');
            }}
          >
            <Copy />
          </Button>
          <Button
            variant="outline"
            size="icon"
            title="Abrir formulário"
            disabled={!publicUrl}
            onClick={() =>
              window.open(publicUrl, '_blank', 'noopener,noreferrer')
            }
          >
            <ExternalLink />
          </Button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Field label="Título da ficha">
          <Input
            value={value.anamnesis_title}
            onChange={(event) => patch({ anamnesis_title: event.target.value })}
            disabled={disabled}
          />
        </Field>
        <Field label="Introdução e orientação ao cliente">
          <Textarea
            value={value.anamnesis_intro}
            onChange={(event) => patch({ anamnesis_intro: event.target.value })}
            disabled={disabled}
            rows={3}
          />
        </Field>
      </section>

      <section className="border-border rounded-lg border">
        <div className="border-border border-b px-4 py-3">
          <h4 className="font-semibold">
            Modalidades e perguntas condicionais
          </h4>
          <p className="text-muted-foreground mt-1 text-xs">
            Ao selecionar uma modalidade, a ficha abre automaticamente o bloco
            clínico correspondente.
          </p>
        </div>
        <div className="grid gap-3 p-4 xl:grid-cols-2">
          {(config.modalities || []).map((modality, index) => (
            <details
              key={modality.id}
              className="border-border rounded-md border"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
                <input
                  type="checkbox"
                  checked={modality.enabled}
                  disabled={disabled}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    updateModality(index, (item) => ({
                      ...item,
                      enabled: event.target.checked,
                    }))
                  }
                />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">
                    {modality.label}
                  </strong>
                  <span className="text-muted-foreground text-xs">
                    {(modality.questions || []).length} perguntas específicas
                  </span>
                </span>
                <ChevronDown className="text-muted-foreground size-4" />
              </summary>
              <div className="border-border space-y-3 border-t p-3">
                <Field label="Nome da modalidade">
                  <Input
                    value={modality.label}
                    disabled={disabled}
                    onChange={(event) =>
                      updateModality(index, (item) => ({
                        ...item,
                        label: event.target.value,
                      }))
                    }
                  />
                </Field>
                {(modality.questions || []).map((question, questionIndex) => (
                  <div
                    key={question.id}
                    className="bg-muted/40 grid gap-2 rounded-md p-3 md:grid-cols-[1fr_125px_auto_auto]"
                  >
                    <Input
                      value={question.label}
                      disabled={disabled}
                      onChange={(event) =>
                        updateModality(index, (item) => ({
                          ...item,
                          questions: (item.questions || []).map(
                            (current, currentIndex) =>
                              currentIndex === questionIndex
                                ? { ...current, label: event.target.value }
                                : current
                          ),
                        }))
                      }
                    />
                    <select
                      className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                      value={question.type}
                      disabled={disabled}
                      onChange={(event) =>
                        updateModality(index, (item) => ({
                          ...item,
                          questions: (item.questions || []).map(
                            (current, currentIndex) =>
                              currentIndex === questionIndex
                                ? {
                                    ...current,
                                    type: event.target
                                      .value as AnamnesisQuestion['type'],
                                  }
                                : current
                          ),
                        }))
                      }
                    >
                      <option value="textarea">Longa</option>
                      <option value="text">Curta</option>
                      <option value="yes_no">Sim/não</option>
                      <option value="body_map">Mapa corporal</option>
                    </select>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={question.required}
                        disabled={disabled}
                        onChange={(event) =>
                          updateModality(index, (item) => ({
                            ...item,
                            questions: (item.questions || []).map(
                              (current, currentIndex) =>
                                currentIndex === questionIndex
                                  ? {
                                      ...current,
                                      required: event.target.checked,
                                    }
                                  : current
                            ),
                          }))
                        }
                      />
                      Obrigatória
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Remover pergunta"
                      disabled={disabled}
                      onClick={() =>
                        updateModality(index, (item) => ({
                          ...item,
                          questions: (item.questions || []).filter(
                            (_, currentIndex) => currentIndex !== questionIndex
                          ),
                        }))
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => addModalityQuestion(index)}
                >
                  <Plus /> Pergunta desta modalidade
                </Button>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="border-border rounded-lg border">
        <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h4 className="font-semibold">Perguntas personalizadas</h4>
            <p className="text-muted-foreground mt-1 text-xs">
              Acrescente questões próprias sem alterar o formulário padrão.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={addQuestion}
            disabled={disabled}
          >
            <Plus /> Pergunta
          </Button>
        </div>
        <div className="space-y-3 p-4">
          {(config.customQuestions || []).length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Nenhuma pergunta personalizada. A ficha padrão já inclui saúde,
              alergias, medicação, histórico e consentimentos.
            </p>
          ) : (
            config.customQuestions.map((question, index) => (
              <div
                key={question.id}
                className="bg-muted/40 grid gap-2 rounded-md p-3 md:grid-cols-[1fr_150px_auto_auto]"
              >
                <Input
                  value={question.label}
                  disabled={disabled}
                  onChange={(event) =>
                    patchConfig({
                      customQuestions: config.customQuestions.map(
                        (item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, label: event.target.value }
                            : item
                      ),
                    })
                  }
                />
                <select
                  className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                  value={question.type}
                  disabled={disabled}
                  onChange={(event) =>
                    patchConfig({
                      customQuestions: config.customQuestions.map(
                        (item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                type: event.target
                                  .value as AnamnesisQuestion['type'],
                              }
                            : item
                      ),
                    })
                  }
                >
                  <option value="textarea">Resposta longa</option>
                  <option value="text">Resposta curta</option>
                  <option value="yes_no">Sim ou não</option>
                  <option value="body_map">Mapa corporal</option>
                </select>
                <label className="flex items-center gap-2 px-2 text-sm">
                  <input
                    type="checkbox"
                    checked={question.required}
                    disabled={disabled}
                    onChange={(event) =>
                      patchConfig({
                        customQuestions: config.customQuestions.map(
                          (item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, required: event.target.checked }
                              : item
                        ),
                      })
                    }
                  />
                  Obrigatória
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Remover pergunta"
                  disabled={disabled}
                  onClick={() =>
                    patchConfig({
                      customQuestions: config.customQuestions.filter(
                        (_, itemIndex) => itemIndex !== index
                      ),
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="border-border overflow-hidden rounded-lg border">
        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h4 className="font-semibold">Fichas recebidas</h4>
            <p className="text-muted-foreground mt-1 text-xs">
              Últimas 50 fichas, ligadas ao cliente sempre que o email é
              reconhecido.
            </p>
          </div>
          <Badge variant="secondary">
            {forms.filter((form) => form.status === 'submitted').length} por
            rever
          </Badge>
        </div>
        <div className="divide-border divide-y">
          {forms.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              Ainda não existem fichas de anamnese.
            </p>
          ) : (
            forms.map((form) => (
              <div
                key={form.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
              >
                <span className="bg-muted flex size-9 items-center justify-center rounded-md">
                  <ClipboardList className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {form.client_name ||
                      form.client_email ||
                      'Ficha sem identificação'}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {form.service?.name || 'Ficha geral'} ·{' '}
                    {new Date(
                      form.submitted_at || form.created_at
                    ).toLocaleString('pt-PT')}
                  </p>
                </div>
                <Badge
                  variant={
                    form.status === 'submitted' ? 'default' : 'secondary'
                  }
                >
                  {form.status === 'submitted'
                    ? 'Recebida'
                    : form.status === 'reviewed'
                      ? 'Revista'
                      : 'Pendente'}
                </Badge>
                {form.contact_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.location.assign(`/contacts/${form.contact_id}`)
                    }
                  >
                    Cliente 360
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    window.open(
                      `/anamnese/${form.public_token}`,
                      '_blank',
                      'noopener,noreferrer'
                    )
                  }
                >
                  <ExternalLink /> Abrir ficha
                </Button>
                {form.status !== 'pending' && (
                  <details className="border-border bg-muted/20 mt-1 w-full rounded-md border">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
                      Ver respostas, modalidades e assinatura
                    </summary>
                    <div className="border-border grid gap-3 border-t p-3 md:grid-cols-2">
                      {form.selected_modalities?.length > 0 && (
                        <div>
                          <p className="text-muted-foreground text-xs">
                            Modalidades
                          </p>
                          <p className="mt-1 text-xs">
                            {form.selected_modalities.join(' · ')}
                          </p>
                        </div>
                      )}
                      {Object.entries(form.answers || {})
                        .filter(
                          ([, answer]) => answer !== '' && answer !== false
                        )
                        .map(([key, answer]) => (
                          <div key={key}>
                            <p className="text-muted-foreground text-xs">
                              {key.replace(/^custom_/, '').replaceAll('_', ' ')}
                            </p>
                            <p className="mt-1 text-xs">
                              {Array.isArray(answer)
                                ? answer.join(', ')
                                : String(answer)}
                            </p>
                          </div>
                        ))}
                      {form.signature_name && (
                        <div>
                          <p className="text-muted-foreground text-xs">
                            Assinatura digital
                          </p>
                          <p className="mt-1 text-xs font-medium">
                            {form.signature_name}
                          </p>
                          {typeof form.answers?.signature_data === 'string' && form.answers.signature_data.startsWith('data:image/') && (
                            <img
                              src={form.answers.signature_data}
                              alt={`Assinatura de ${form.signature_name}`}
                              className="mt-2 h-20 max-w-full rounded border bg-white object-contain"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={disabled || saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Guardar anamnese
        </Button>
      </div>
    </div>
  );
}

function ToggleLine({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className="border-border flex cursor-pointer items-center justify-between gap-3 rounded-md border p-3 text-sm">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="size-4"
      />
    </label>
  );
}

function CatalogTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

function ServiceList({
  services,
  currency,
  canImport,
  onImport,
  onEdit,
  onToggle,
}: {
  services: ClinicService[];
  currency: string;
  canImport: boolean;
  onImport: (file: File) => void;
  onEdit: (item: ClinicService) => void;
  onToggle: (item: ClinicService) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-foreground text-base font-semibold">
            Lista de serviços
          </h3>
          <p className="text-muted-foreground text-xs">
            Use referências, categorias e flags para organizar a agenda,
            comissões e marcação online.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ServiceFlag label="Online" active />
          <ServiceFlag
            label="IVA"
            active={services.some((s) => s.iva_enabled)}
          />
          <ServiceFlag
            label="Comissões"
            active={services.some((s) => s.commissions_enabled)}
          />
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" />
            Imprimir
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImport(file);
              event.target.value = '';
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!canImport}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-4" />
            Importar CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportServicesCsv(services, currency)}
          >
            <Download className="size-4" />
            Exportar
          </Button>
        </div>
      </div>

      {services.length === 0 ? (
        <EmptyCatalog label="Nenhum procedimento cadastrado." />
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Nome</th>
                <th className="px-3 py-2 text-left font-medium">Ref.</th>
                <th className="px-3 py-2 text-left font-medium">Duração</th>
                <th className="px-3 py-2 text-left font-medium">Preço</th>
                <th className="px-3 py-2 text-left font-medium">Categoria</th>
                <th className="px-3 py-2 text-center font-medium">Online</th>
                <th className="px-3 py-2 text-center font-medium">IVA</th>
                <th className="px-3 py-2 text-center font-medium">Comissão</th>
                <th className="px-3 py-2 text-left font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr
                  key={service.id}
                  className="border-border hover:bg-muted/40 border-t transition-colors"
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: service.color }}
                      />
                      <div className="min-w-0">
                        <p className="text-foreground truncate font-medium">
                          {service.name}
                        </p>
                        {service.description ? (
                          <p className="text-muted-foreground truncate text-xs">
                            {service.description}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="text-muted-foreground px-3 py-2">
                    {service.reference ?? '--'}
                  </td>
                  <td className="px-3 py-2">{service.duration_minutes} min</td>
                  <td className="px-3 py-2">
                    {formatCurrency(
                      Number(service.price),
                      service.currency || currency
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {service.category ?? 'Genérico'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <FeatureCell active={service.online_enabled ?? true} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <FeatureCell active={service.iva_enabled ?? false} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <FeatureCell
                      active={service.commissions_enabled ?? false}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit(service)}
                      >
                        <Pencil className="size-4" />
                        Editar
                      </Button>
                      <Button
                        variant={service.is_active ? 'outline' : 'default'}
                        size="sm"
                        onClick={() => onToggle(service)}
                      >
                        {service.is_active ? 'Desativar' : 'Ativar'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ServiceFlag({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center rounded-md border px-2 text-xs font-medium',
        active
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-border text-muted-foreground'
      )}
    >
      {label}
    </span>
  );
}

function FeatureCell({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex size-5 items-center justify-center rounded bg-emerald-500 text-xs font-bold text-white">
      ✓
    </span>
  ) : (
    <span className="border-border inline-flex size-5 rounded border" />
  );
}

function exportServicesCsv(services: ClinicService[], currency: string) {
  const header = ['Nome', 'Ref.', 'Duração', 'Preço', 'Categoria', 'Ativo'];
  const rows = services.map((service) => [
    service.name,
    service.reference ?? '',
    `${service.duration_minutes} min`,
    formatCurrency(Number(service.price), service.currency || currency),
    service.category ?? '',
    service.is_active ? 'Sim' : 'Não',
  ]);
  const csv = [header, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    )
    .join('\n');
  const url = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'servicos.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function formatShortTime(value: string | null | undefined) {
  if (!value) return '--';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '--';
  return new Intl.DateTimeFormat('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatWorkStatus(status: string) {
  if (status === 'open') return 'Aberto';
  if (status === 'closed') return 'Fechado';
  if (status === 'absent') return 'Falta';
  return status;
}

function ServiceOption({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="border-border bg-muted/30 flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function ProfessionalsPanel({
  members,
  workSessionsByUser,
  canEdit,
  saving,
  onChange,
  onSave,
}: {
  members: AccountMember[];
  workSessionsByUser: Record<string, ProfessionalWorkSession[]>;
  canEdit: boolean;
  saving: boolean;
  onChange: (userId: string, patch: Partial<AccountMember>) => void;
  onSave: (member: AccountMember) => void;
}) {
  if (members.length === 0) {
    return <EmptyCatalog label="Nenhum membro encontrado para configurar." />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-foreground text-base font-semibold">
          Configuração dos profissionais
        </h3>
        <p className="text-muted-foreground text-xs">
          Defina quem aparece na agenda, horários de trabalho, página pública e
          bloqueio de marcação online.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {members.map((member) => {
          const hours = normalizeWorkingHours(member.working_hours);
          const workSessions = workSessionsByUser[member.user_id] ?? [];

          function updateHours(day: WorkDayKey, patch: Partial<WorkDayConfig>) {
            onChange(member.user_id, {
              working_hours: {
                ...hours,
                [day]: { ...hours[day], ...patch },
              },
            });
          }

          return (
            <Card key={member.user_id} className="rounded-lg" size="sm">
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="flex size-11 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-white"
                      style={{
                        backgroundColor: member.professional_color ?? COLORS[0],
                      }}
                    >
                      {(member.full_name || member.email || '?')
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-foreground truncate font-semibold">
                        {member.full_name || member.email}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {member.email ?? 'Sem email visível'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant={member.is_professional ? 'default' : 'outline'}
                    size="sm"
                    disabled={!canEdit}
                    onClick={() =>
                      onChange(member.user_id, {
                        is_professional: !member.is_professional,
                      })
                    }
                  >
                    <Users className="size-4" />
                    {member.is_professional ? 'Profissional' : 'Ativar'}
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Especialidade">
                    <Input
                      value={member.professional_title ?? ''}
                      disabled={!canEdit}
                      onChange={(event) =>
                        onChange(member.user_id, {
                          professional_title: event.target.value,
                        })
                      }
                      placeholder="Ex: Massoterapeuta"
                    />
                  </Field>
                  <Field label="Telefone / WhatsApp">
                    <Input
                      value={member.professional_phone ?? ''}
                      disabled={!canEdit}
                      onChange={(event) =>
                        onChange(member.user_id, {
                          professional_phone: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Página pública">
                    <div className="flex items-center gap-2">
                      <Globe2 className="text-muted-foreground size-4" />
                      <Input
                        value={member.professional_public_slug ?? ''}
                        disabled={!canEdit}
                        onChange={(event) =>
                          onChange(member.user_id, {
                            professional_public_slug: event.target.value,
                          })
                        }
                        placeholder="utilizador"
                      />
                    </div>
                  </Field>
                  <Field label="Cor">
                    <Input
                      type="color"
                      value={member.professional_color ?? COLORS[0]}
                      disabled={!canEdit}
                      onChange={(event) =>
                        onChange(member.user_id, {
                          professional_color: event.target.value,
                        })
                      }
                    />
                  </Field>
                </div>

                <Field label="Biografia">
                  <Textarea
                    value={member.professional_bio ?? ''}
                    disabled={!canEdit}
                    onChange={(event) =>
                      onChange(member.user_id, {
                        professional_bio: event.target.value,
                      })
                    }
                    className="min-h-20"
                    placeholder="Apresentação, formação e especialidades."
                  />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Comissão executante (%)">
                    <div className="flex items-center gap-2">
                      <Percent className="text-muted-foreground size-4" />
                      <Input
                        inputMode="decimal"
                        value={member.commission_executant_percent ?? 0}
                        disabled={!canEdit}
                        onChange={(event) =>
                          onChange(member.user_id, {
                            commission_executant_percent: Number(
                              event.target.value.replace(',', '.')
                            ),
                          })
                        }
                      />
                    </div>
                  </Field>
                  <Field label="Comissão responsável (%)">
                    <div className="flex items-center gap-2">
                      <Percent className="text-muted-foreground size-4" />
                      <Input
                        inputMode="decimal"
                        value={member.commission_responsible_percent ?? 0}
                        disabled={!canEdit}
                        onChange={(event) =>
                          onChange(member.user_id, {
                            commission_responsible_percent: Number(
                              event.target.value.replace(',', '.')
                            ),
                          })
                        }
                      />
                    </div>
                  </Field>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <ServiceOption
                    label="Mostrar na marcação online"
                    checked={member.professional_show_online ?? true}
                    disabled={!canEdit}
                    onChange={(checked) =>
                      onChange(member.user_id, {
                        professional_show_online: checked,
                      })
                    }
                  />
                  <ServiceOption
                    label="Bloquear marcação online"
                    checked={member.online_booking_blocked ?? false}
                    disabled={!canEdit}
                    onChange={(checked) =>
                      onChange(member.user_id, {
                        online_booking_blocked: checked,
                      })
                    }
                  />
                </div>

                <div className="border-border rounded-lg border">
                  <div className="border-border bg-muted/40 flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">
                    <Clock3 className="text-primary size-4" />
                    Horário de trabalho
                  </div>
                  <div className="divide-border divide-y">
                    {WEEK_DAYS.map((day) => (
                      <div
                        key={day.key}
                        className="grid gap-2 px-3 py-2 text-xs sm:grid-cols-[90px_1fr_1fr_1fr_1fr]"
                      >
                        <label className="flex items-center gap-2 font-medium">
                          <input
                            type="checkbox"
                            checked={hours[day.key].enabled}
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateHours(day.key, {
                                enabled: event.target.checked,
                              })
                            }
                          />
                          {day.label}
                        </label>
                        <Input
                          type="time"
                          value={hours[day.key].start}
                          disabled={!canEdit || !hours[day.key].enabled}
                          onChange={(event) =>
                            updateHours(day.key, { start: event.target.value })
                          }
                        />
                        <Input
                          type="time"
                          value={hours[day.key].breakStart}
                          disabled={!canEdit || !hours[day.key].enabled}
                          onChange={(event) =>
                            updateHours(day.key, {
                              breakStart: event.target.value,
                            })
                          }
                        />
                        <Input
                          type="time"
                          value={hours[day.key].breakEnd}
                          disabled={!canEdit || !hours[day.key].enabled}
                          onChange={(event) =>
                            updateHours(day.key, {
                              breakEnd: event.target.value,
                            })
                          }
                        />
                        <Input
                          type="time"
                          value={hours[day.key].end}
                          disabled={!canEdit || !hours[day.key].enabled}
                          onChange={(event) =>
                            updateHours(day.key, { end: event.target.value })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-border rounded-lg border">
                  <div className="border-border bg-muted/40 flex items-center justify-between gap-2 border-b px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <CalendarDays className="text-primary size-4" />
                      Folha de jornada
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      render={<Link href="/settings?tab=work-time" />}
                    >
                      Ver completa
                    </Button>
                  </div>
                  <div className="space-y-2 p-3">
                    {workSessions.length === 0 ? (
                      <p className="bg-muted/40 text-muted-foreground rounded-md px-3 py-3 text-xs">
                        Nenhum ponto recente registado para este profissional.
                      </p>
                    ) : (
                      workSessions.map((session) => (
                        <div
                          key={session.id}
                          className="bg-muted/40 grid gap-2 rounded-md px-3 py-2 text-xs sm:grid-cols-[1fr_auto]"
                        >
                          <div>
                            <p className="text-foreground font-semibold">
                              {session.work_date}
                            </p>
                            <p className="text-muted-foreground">
                              Início {formatShortTime(session.started_at)} ·
                              Fecho {formatShortTime(session.closed_at)}
                            </p>
                          </div>
                          <span className="bg-background text-muted-foreground h-fit rounded-full px-2 py-1 text-[10px] font-medium">
                            {formatWorkStatus(session.status)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={() => onSave(member)}
                    disabled={!canEdit || saving}
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Guardar profissional
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ProductList({
  products,
  currency,
  onEdit,
  onToggle,
}: {
  products: ClinicProduct[];
  currency: string;
  onEdit: (item: ClinicProduct) => void;
  onToggle: (item: ClinicProduct) => void;
}) {
  if (products.length === 0)
    return <EmptyCatalog label="Nenhum produto cadastrado." />;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {products.map((product) => (
        <CatalogCard
          key={product.id}
          color="#14b8a6"
          title={product.name}
          subtitle={`${formatCurrency(
            Number(product.price),
            product.currency || currency
          )} · stock ${product.stock_quantity}`}
          description={product.sku ? `SKU ${product.sku}` : product.description}
          active={product.is_active}
          onEdit={() => onEdit(product)}
          onToggle={() => onToggle(product)}
        />
      ))}
    </div>
  );
}

function RoomList({
  rooms,
  onEdit,
  onToggle,
}: {
  rooms: ClinicRoom[];
  onEdit: (item: ClinicRoom) => void;
  onToggle: (item: ClinicRoom) => void;
}) {
  if (rooms.length === 0)
    return <EmptyCatalog label="Nenhuma sala cadastrada." />;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {rooms.map((room) => (
        <CatalogCard
          key={room.id}
          color={room.color}
          title={room.name}
          subtitle="Recurso de agenda"
          description={room.description}
          active={room.is_active}
          onEdit={() => onEdit(room)}
          onToggle={() => onToggle(room)}
        />
      ))}
    </div>
  );
}

function CatalogCard({
  color,
  title,
  subtitle,
  description,
  active,
  onEdit,
  onToggle,
}: {
  color: string;
  title: string;
  subtitle: string;
  description?: string | null;
  active: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  return (
    <Card className="rounded-lg" size="sm">
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <span
            className="mt-1 size-3 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate text-sm font-semibold">
              {title}
            </p>
            <p className="text-muted-foreground text-xs">{subtitle}</p>
          </div>
          <Badge variant={active ? 'default' : 'outline'}>
            {active ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
        {description ? (
          <p className="text-muted-foreground line-clamp-2 text-xs">
            {description}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="size-4" />
            Editar
          </Button>
          <Button variant="outline" size="sm" onClick={onToggle}>
            {active ? 'Desativar' : 'Ativar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyCatalog({ label }: { label: string }) {
  return (
    <div className="bg-muted/30 flex min-h-40 flex-col items-center justify-center rounded-lg text-center">
      <CalendarDays className="text-muted-foreground size-7" />
      <p className="text-muted-foreground mt-2 text-sm">{label}</p>
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label="Cor">
      <div className="flex flex-wrap gap-2">
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Usar cor ${color}`}
            onClick={() => onChange(color)}
            className={cn(
              'size-8 rounded-md border transition-transform',
              value === color ? 'border-foreground scale-105' : 'border-border'
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </Field>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-foreground font-medium">{label}</span>
      {children}
    </label>
  );
}

function ImportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="text-muted-foreground block text-xs">{label}</span>
      <strong className="mt-1 block truncate text-sm" title={value}>
        {value}
      </strong>
    </div>
  );
}

function normalizeServiceName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
