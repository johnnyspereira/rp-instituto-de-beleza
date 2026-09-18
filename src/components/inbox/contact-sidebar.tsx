'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  Copy,
  DollarSign,
  Gift,
  History,
  Loader2,
  Mail,
  Pencil,
  PackageCheck,
  Phone,
  Plus,
  Save,
  SlidersHorizontal,
  StickyNote,
  Tag as TagIcon,
  type LucideIcon,
  User,
  Workflow,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import { createClient } from '@/lib/supabase/client';
import type {
  Contact,
  ContactCustomValue,
  ContactNote,
  CustomField,
  Deal,
  DealStatus,
  FinanceClientPack,
  FinanceVoucher,
  Pipeline,
  PipelineStage,
  Tag,
} from '@/types';

interface ContactSidebarProps {
  contact: Contact | null;
  conversationId?: string | null;
  onContactUpdated?: (contact: Contact) => void;
}

type ContactTagItem = Tag & {
  contact_tag_id: string;
  contact_tag_created_at?: string;
};
type DealWithRelations = Deal & {
  stage?: PipelineStage | null;
  pipeline?: Pipeline | null;
};
type TimelineTone = 'note' | 'deal' | 'tag' | 'automation' | 'contact';

interface ContactAppointmentItem {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  price: number;
  currency: string;
  service?: { name?: string | null } | null;
  professional?: { full_name?: string | null; email?: string | null } | null;
}

type InboxClientPack = FinanceClientPack & {
  balances?: Array<{
    id: string;
    remaining_sessions: number;
    service?: { name?: string | null } | null;
  }>;
};

interface AutomationLogItem {
  id: string;
  automation_id: string;
  contact_id: string | null;
  trigger_event: string;
  steps_executed: unknown[];
  status: string;
  error_message?: string | null;
  created_at: string;
  automation?: { name?: string | null } | null;
  automations?: { name?: string | null } | null;
}

interface TimelineEvent {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  tone: TimelineTone;
}

interface ContactDraft {
  name: string;
  clientReference: string;
  phone: string;
  email: string;
  company: string;
}

const DEAL_STATUS_OPTIONS: { value: DealStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

function draftFromContact(contact: Contact | null): ContactDraft {
  return {
    name: contact?.name ?? '',
    clientReference: contact?.client_reference ?? '',
    phone: contact?.phone ?? '',
    email: contact?.email ?? '',
    company: contact?.company ?? '',
  };
}

function mapContactTag(row: Record<string, unknown>): ContactTagItem | null {
  const tag = row.tags as Tag | null | undefined;
  if (!tag) return null;
  return {
    ...tag,
    contact_tag_id: row.id as string,
    contact_tag_created_at: row.created_at as string | undefined,
  };
}

function automationName(log: AutomationLogItem): string {
  return log.automation?.name ?? log.automations?.name ?? log.trigger_event;
}

function timelineToneClass(tone: TimelineTone): string {
  switch (tone) {
    case 'deal':
      return 'bg-emerald-500';
    case 'tag':
      return 'bg-sky-500';
    case 'automation':
      return 'bg-violet-500';
    case 'contact':
      return 'bg-amber-500';
    default:
      return 'bg-primary';
  }
}

function formatDealStatus(status: string | null | undefined): string {
  if (!status) return 'Open';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatAppointmentStatus(status: string): string {
  if (status === 'scheduled') return 'Agendado';
  if (status === 'confirmed') return 'Confirmado';
  if (status === 'completed') return 'Concluído';
  if (status === 'cancelled') return 'Cancelado';
  if (status === 'no_show') return 'Falta';
  return status;
}

export function ContactSidebar({
  contact,
  conversationId,
  onContactUpdated,
}: ContactSidebarProps) {
  const router = useRouter();
  const { accountId, user, defaultCurrency } = useAuth();
  const [localContact, setLocalContact] = useState<Contact | null>(contact);
  const [draft, setDraft] = useState<ContactDraft>(() =>
    draftFromContact(contact)
  );
  const [editingContact, setEditingContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [copied, setCopied] = useState(false);

  const [deals, setDeals] = useState<DealWithRelations[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [contactTags, setContactTags] = useState<ContactTagItem[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [automationLogs, setAutomationLogs] = useState<AutomationLogItem[]>([]);
  const [appointments, setAppointments] = useState<ContactAppointmentItem[]>(
    []
  );
  const [activeVouchers, setActiveVouchers] = useState<FinanceVoucher[]>([]);
  const [activePacks, setActivePacks] = useState<InboxClientPack[]>([]);
  const [sessionEvents, setSessionEvents] = useState<TimelineEvent[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  const [selectedTagId, setSelectedTagId] = useState('');
  const [addingTag, setAddingTag] = useState(false);
  const [removingTagId, setRemovingTagId] = useState<string | null>(null);

  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [savingCustomFields, setSavingCustomFields] = useState(false);

  const [dealOpen, setDealOpen] = useState(false);
  const [dealTitle, setDealTitle] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [dealPipelineId, setDealPipelineId] = useState('');
  const [dealStageId, setDealStageId] = useState('');
  const [dealNotes, setDealNotes] = useState('');
  const [savingDeal, setSavingDeal] = useState(false);
  const [updatingDealId, setUpdatingDealId] = useState<string | null>(null);

  const activeContact = localContact ?? contact;

  useEffect(() => {
    // Prop-driven editor reset when the user selects another conversation.
    /* eslint-disable react-hooks/set-state-in-effect */
    setLocalContact(contact);
    setDraft(draftFromContact(contact));
    setEditingContact(false);
    setSessionEvents([]);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [contact]);

  const availableStages = useMemo(
    () => stages.filter((stage) => stage.pipeline_id === dealPipelineId),
    [dealPipelineId, stages]
  );

  const availableTags = useMemo(() => {
    const attached = new Set(contactTags.map((tag) => tag.id));
    return allTags.filter((tag) => !attached.has(tag.id));
  }, [allTags, contactTags]);

  const stagesByPipelineId = useMemo(() => {
    const map = new Map<string, PipelineStage[]>();
    for (const stage of stages) {
      const list = map.get(stage.pipeline_id) ?? [];
      list.push(stage);
      map.set(stage.pipeline_id, list);
    }
    return map;
  }, [stages]);

  const pushSessionEvent = useCallback(
    (title: string, detail: string, tone: TimelineTone) => {
      setSessionEvents((prev) =>
        [
          {
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            title,
            detail,
            createdAt: new Date().toISOString(),
            tone,
          },
          ...prev,
        ].slice(0, 8)
      );
    },
    []
  );

  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    const events: TimelineEvent[] = [...sessionEvents];

    for (const note of notes) {
      events.push({
        id: `note-${note.id}`,
        title: 'Note created',
        detail: note.note_text,
        createdAt: note.created_at,
        tone: 'note',
      });
    }

    for (const deal of deals) {
      events.push({
        id: `deal-created-${deal.id}`,
        title: 'Deal created',
        detail: `${deal.title} - ${formatCurrency(
          deal.value,
          deal.currency ?? defaultCurrency
        )}`,
        createdAt: deal.created_at,
        tone: 'deal',
      });
      if (deal.updated_at && deal.updated_at !== deal.created_at) {
        events.push({
          id: `deal-updated-${deal.id}`,
          title: 'Deal updated',
          detail: `${deal.title} moved to ${deal.stage?.name ?? 'stage'}`,
          createdAt: deal.updated_at,
          tone: 'deal',
        });
      }
    }

    for (const tag of contactTags) {
      if (!tag.contact_tag_created_at) continue;
      events.push({
        id: `tag-${tag.contact_tag_id}`,
        title: 'Tag added',
        detail: tag.name,
        createdAt: tag.contact_tag_created_at,
        tone: 'tag',
      });
    }

    for (const log of automationLogs) {
      events.push({
        id: `automation-${log.id}`,
        title: 'Automation fired',
        detail: `${automationName(log)} - ${log.status}`,
        createdAt: log.created_at,
        tone: 'automation',
      });
    }

    for (const appointment of appointments) {
      events.push({
        id: `appointment-${appointment.id}`,
        title: 'Appointment linked',
        detail: `${appointment.service?.name ?? 'Serviço'} - ${format(
          new Date(appointment.scheduled_start),
          'dd/MM/yyyy HH:mm'
        )}`,
        createdAt: appointment.scheduled_start,
        tone: 'contact',
      });
    }

    if (activeContact?.updated_at) {
      events.push({
        id: `contact-updated-${activeContact.id}`,
        title: 'Contact updated',
        detail: activeContact.name || activeContact.phone,
        createdAt: activeContact.updated_at,
        tone: 'contact',
      });
    }

    const seen = new Set<string>();
    return events
      .filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, 12);
  }, [
    activeContact,
    appointments,
    automationLogs,
    contactTags,
    deals,
    defaultCurrency,
    notes,
    sessionEvents,
  ]);

  const fetchContactData = useCallback(async () => {
    if (!contact) {
      setDeals([]);
      setNotes([]);
      setContactTags([]);
      setAllTags([]);
      setPipelines([]);
      setStages([]);
      setCustomFields([]);
      setCustomValues({});
      setAutomationLogs([]);
      setAppointments([]);
      setActiveVouchers([]);
      setActivePacks([]);
      return;
    }

    setLoadingData(true);
    const supabase = createClient();

    const [
      dealsRes,
      notesRes,
      contactTagsRes,
      tagsRes,
      pipelinesRes,
      stagesRes,
      customFieldsRes,
      customValuesRes,
      automationLogsRes,
      appointmentsRes,
      vouchersRes,
      packsRes,
    ] = await Promise.all([
      supabase
        .from('deals')
        .select('*, stage:pipeline_stages(*), pipeline:pipelines(*)')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('contact_notes')
        .select('*')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('contact_tags')
        .select('id, tag_id, created_at, tags(*)')
        .eq('contact_id', contact.id),
      supabase.from('tags').select('*').order('name'),
      supabase.from('pipelines').select('*').order('created_at'),
      supabase
        .from('pipeline_stages')
        .select('*')
        .order('position', { ascending: true }),
      supabase.from('custom_fields').select('*').order('field_name'),
      supabase
        .from('contact_custom_values')
        .select('*')
        .eq('contact_id', contact.id),
      supabase
        .from('automation_logs')
        .select('*, automation:automations(name)')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('clinic_appointments')
        .select(
          'id, scheduled_start, scheduled_end, status, price, currency, service:clinic_services(name), professional:profiles!clinic_appointments_professional_profile_id_fkey(full_name, email)'
        )
        .eq('contact_id', contact.id)
        .order('scheduled_start', { ascending: false })
        .limit(8),
      supabase
        .from('finance_vouchers')
        .select('*')
        .eq('owner_contact_id', contact.id)
        .eq('status', 'active')
        .gt('current_balance', 0)
        .order('expires_at', { ascending: true, nullsFirst: false }),
      supabase
        .from('finance_client_packs')
        .select(
          '*, pack:finance_pack_catalog(*), balances:finance_client_pack_balances(*, service:clinic_services(name))'
        )
        .eq('contact_id', contact.id)
        .eq('status', 'active')
        .order('expires_at', { ascending: true, nullsFirst: false }),
    ]);

    setDeals((dealsRes.data as DealWithRelations[] | null) ?? []);
    setNotes((notesRes.data as ContactNote[] | null) ?? []);
    setContactTags(
      ((contactTagsRes.data as Record<string, unknown>[] | null) ?? [])
        .map(mapContactTag)
        .filter((tag): tag is ContactTagItem => Boolean(tag))
    );
    setAllTags((tagsRes.data as Tag[] | null) ?? []);

    const nextPipelines = (pipelinesRes.data as Pipeline[] | null) ?? [];
    const nextStages = (stagesRes.data as PipelineStage[] | null) ?? [];
    setPipelines(nextPipelines);
    setStages(nextStages);
    setCustomFields((customFieldsRes.data as CustomField[] | null) ?? []);
    setAutomationLogs(
      (automationLogsRes.data as AutomationLogItem[] | null) ?? []
    );
    setAppointments(
      appointmentsRes.error
        ? []
        : ((appointmentsRes.data as ContactAppointmentItem[] | null) ?? [])
    );
    const now = Date.now();
    setActiveVouchers(
      vouchersRes.error
        ? []
        : ((vouchersRes.data as FinanceVoucher[] | null) ?? []).filter(
            (voucher) =>
              !voucher.expires_at ||
              new Date(voucher.expires_at).getTime() > now
          )
    );
    setActivePacks(
      packsRes.error
        ? []
        : ((packsRes.data as InboxClientPack[] | null) ?? []).filter(
            (clientPack) =>
              (!clientPack.expires_at ||
                new Date(clientPack.expires_at).getTime() > now) &&
              (clientPack.balances ?? []).some(
                (balance) => Number(balance.remaining_sessions) > 0
              )
          )
    );

    const nextCustomValues: Record<string, string> = {};
    for (const value of (customValuesRes.data as ContactCustomValue[] | null) ??
      []) {
      nextCustomValues[value.custom_field_id] = value.value ?? '';
    }
    setCustomValues(nextCustomValues);

    const firstPipeline = nextPipelines[0];
    const firstStage = firstPipeline
      ? nextStages.find((stage) => stage.pipeline_id === firstPipeline.id)
      : null;
    setDealPipelineId((current) => current || firstPipeline?.id || '');
    setDealStageId((current) => current || firstStage?.id || '');
    setLoadingData(false);
  }, [contact]);

  useEffect(() => {
    // Contact switch/refetch: the async loader owns all sidebar resource state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchContactData();
  }, [fetchContactData]);

  useEffect(() => {
    if (!dealPipelineId) return;
    if (availableStages.some((stage) => stage.id === dealStageId)) return;
    // Keep the selected stage valid when the pipeline changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDealStageId(availableStages[0]?.id ?? '');
  }, [availableStages, dealPipelineId, dealStageId]);

  const handleCopyPhone = useCallback(async () => {
    if (!activeContact?.phone) return;
    await navigator.clipboard.writeText(activeContact.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [activeContact]);

  const handleSaveContact = useCallback(async () => {
    if (!activeContact || !draft.phone.trim()) return;

    setSavingContact(true);
    const supabase = createClient();
    const payload = {
      name: draft.name.trim() || null,
      client_reference: draft.clientReference.trim() || null,
      phone: draft.phone.trim(),
      email: draft.email.trim() || null,
      company: draft.company.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('contacts')
      .update(payload)
      .eq('id', activeContact.id)
      .select('*')
      .single();

    setSavingContact(false);

    if (error || !data) {
      toast.error(error?.message ?? 'Could not update contact.');
      return;
    }

    const updated = data as Contact;
    setLocalContact(updated);
    setDraft(draftFromContact(updated));
    setEditingContact(false);
    onContactUpdated?.(updated);
    pushSessionEvent(
      'Contact updated',
      updated.name || updated.phone,
      'contact'
    );
    toast.success('Contact updated.');
  }, [activeContact, draft, onContactUpdated, pushSessionEvent]);

  const handleAddTag = useCallback(async () => {
    if (!activeContact || !selectedTagId) return;
    setAddingTag(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from('contact_tags')
      .insert({ contact_id: activeContact.id, tag_id: selectedTagId })
      .select('id, tag_id, created_at, tags(*)')
      .single();

    setAddingTag(false);

    if (error || !data) {
      toast.error(error?.message ?? 'Could not add tag.');
      return;
    }

    const mapped = mapContactTag(data as Record<string, unknown>);
    if (mapped) {
      setContactTags((prev) => [...prev, mapped]);
      pushSessionEvent('Tag added', mapped.name, 'tag');
    }
    setSelectedTagId('');
  }, [activeContact, pushSessionEvent, selectedTagId]);

  const handleRemoveTag = useCallback(
    async (contactTagId: string) => {
      const tag = contactTags.find(
        (item) => item.contact_tag_id === contactTagId
      );
      setRemovingTagId(contactTagId);
      const supabase = createClient();
      const { error } = await supabase
        .from('contact_tags')
        .delete()
        .eq('id', contactTagId);
      setRemovingTagId(null);

      if (error) {
        toast.error(error.message);
        return;
      }

      setContactTags((prev) =>
        prev.filter((item) => item.contact_tag_id !== contactTagId)
      );
      if (tag) pushSessionEvent('Tag removed', tag.name, 'tag');
    },
    [contactTags, pushSessionEvent]
  );

  const handleAddNote = useCallback(async () => {
    if (!activeContact || !newNote.trim() || !accountId || !user?.id) return;
    setAddingNote(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from('contact_notes')
      .insert({
        contact_id: activeContact.id,
        account_id: accountId,
        user_id: user.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    setAddingNote(false);

    if (error || !data) {
      toast.error(error?.message ?? 'Could not add note.');
      return;
    }

    const note = data as ContactNote;
    setNotes((prev) => [note, ...prev]);
    setNewNote('');
    pushSessionEvent('Note created', note.note_text, 'note');
  }, [accountId, activeContact, newNote, pushSessionEvent, user]);

  const handleSaveCustomFields = useCallback(async () => {
    if (!activeContact) return;
    setSavingCustomFields(true);

    const rows = Object.entries(customValues)
      .filter(([, value]) => value.trim())
      .map(([fieldId, value]) => ({
        contact_id: activeContact.id,
        custom_field_id: fieldId,
        value: value.trim(),
      }));

    const supabase = createClient();
    const deleteRes = await supabase
      .from('contact_custom_values')
      .delete()
      .eq('contact_id', activeContact.id);

    if (deleteRes.error) {
      setSavingCustomFields(false);
      toast.error(deleteRes.error.message);
      return;
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from('contact_custom_values')
        .insert(rows);
      if (error) {
        setSavingCustomFields(false);
        toast.error(error.message);
        return;
      }
    }

    setSavingCustomFields(false);
    pushSessionEvent(
      'Custom fields updated',
      `${rows.length} saved`,
      'contact'
    );
    toast.success('Custom fields saved.');
  }, [activeContact, customValues, pushSessionEvent]);

  const resetDealForm = useCallback(() => {
    const firstPipeline = pipelines[0];
    const firstStage = firstPipeline
      ? stages.find((stage) => stage.pipeline_id === firstPipeline.id)
      : null;
    setDealTitle('');
    setDealValue('');
    setDealPipelineId(firstPipeline?.id ?? '');
    setDealStageId(firstStage?.id ?? '');
    setDealNotes('');
  }, [pipelines, stages]);

  const handleCreateDeal = useCallback(async () => {
    if (
      !activeContact ||
      !accountId ||
      !user?.id ||
      !dealTitle.trim() ||
      !dealPipelineId ||
      !dealStageId
    ) {
      return;
    }

    setSavingDeal(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('deals')
      .insert({
        account_id: accountId,
        user_id: user.id,
        contact_id: activeContact.id,
        conversation_id: conversationId || null,
        pipeline_id: dealPipelineId,
        stage_id: dealStageId,
        title: dealTitle.trim(),
        value: Number.parseFloat(dealValue) || 0,
        currency: defaultCurrency,
        notes: dealNotes.trim() || null,
        status: 'open',
      })
      .select('*, stage:pipeline_stages(*), pipeline:pipelines(*)')
      .single();

    setSavingDeal(false);

    if (error || !data) {
      toast.error(error?.message ?? 'Could not create deal.');
      return;
    }

    const created = data as DealWithRelations;
    setDeals((prev) => [created, ...prev]);
    setDealOpen(false);
    resetDealForm();
    pushSessionEvent('Deal created', created.title, 'deal');
    toast.success('Deal created from inbox.');
  }, [
    accountId,
    activeContact,
    conversationId,
    dealNotes,
    dealPipelineId,
    dealStageId,
    dealTitle,
    dealValue,
    defaultCurrency,
    pushSessionEvent,
    resetDealForm,
    user,
  ]);

  const updateDeal = useCallback(
    async (
      dealId: string,
      patch: Partial<Pick<Deal, 'pipeline_id' | 'stage_id' | 'status'>>,
      eventDetail: string
    ) => {
      setUpdatingDealId(dealId);
      const supabase = createClient();
      const { data, error } = await supabase
        .from('deals')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', dealId)
        .select('*, stage:pipeline_stages(*), pipeline:pipelines(*)')
        .single();
      setUpdatingDealId(null);

      if (error || !data) {
        toast.error(error?.message ?? 'Could not update deal.');
        return;
      }

      const updated = data as DealWithRelations;
      setDeals((prev) =>
        prev.map((deal) => (deal.id === dealId ? updated : deal))
      );
      pushSessionEvent('Deal updated', eventDetail, 'deal');
    },
    [pushSessionEvent]
  );

  const handleDealPipelineChange = useCallback(
    (deal: DealWithRelations, pipelineId: string) => {
      const firstStage = stagesByPipelineId.get(pipelineId)?.[0];
      if (!firstStage) {
        toast.error('This pipeline has no stages.');
        return;
      }
      void updateDeal(
        deal.id,
        { pipeline_id: pipelineId, stage_id: firstStage.id },
        `${deal.title} moved to ${firstStage.name}`
      );
    },
    [stagesByPipelineId, updateDeal]
  );

  const handleDealStageChange = useCallback(
    (deal: DealWithRelations, stageId: string) => {
      const stage = stages.find((item) => item.id === stageId);
      if (!stage) return;
      void updateDeal(
        deal.id,
        { stage_id: stage.id, pipeline_id: stage.pipeline_id },
        `${deal.title} moved to ${stage.name}`
      );
    },
    [stages, updateDeal]
  );

  const handleDealStatusChange = useCallback(
    (deal: DealWithRelations, status: DealStatus) => {
      void updateDeal(deal.id, { status }, `${deal.title} marked ${status}`);
    },
    [updateDeal]
  );

  if (!activeContact) {
    return (
      <div className="border-border bg-card flex h-full w-80 items-center justify-center border-l">
        <p className="text-muted-foreground text-sm">Select a conversation</p>
      </div>
    );
  }

  const displayName = activeContact.name || activeContact.phone;
  const initials = displayName.charAt(0).toUpperCase();
  const openDeals = deals.filter((deal) => (deal.status ?? 'open') === 'open');

  return (
    <div className="border-border bg-card flex h-full min-h-0 w-full flex-col overflow-hidden border-l xl:w-96">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4">
          <section className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="bg-muted text-foreground flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold">
                {activeContact.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeContact.avatar_url}
                    alt={displayName}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-foreground truncate text-sm font-semibold">
                  {displayName}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {activeContact.company || 'No company'}
                </p>
                <div className="mt-2 flex gap-2">
                  <span className="bg-primary/10 text-primary rounded-md px-2 py-1 text-[10px] font-semibold">
                    Ref. {activeContact.client_reference ?? '--'}
                  </span>
                  <span className="bg-muted text-muted-foreground rounded-md px-2 py-1 text-[10px]">
                    {openDeals.length} active deals
                  </span>
                  <span className="bg-muted text-muted-foreground rounded-md px-2 py-1 text-[10px]">
                    {contactTags.length} tags
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingContact((prev) => !prev)}
                className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                title={editingContact ? 'Close editor' : 'Edit contact'}
              >
                {editingContact ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Pencil className="h-4 w-4" />
                )}
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-8 w-full"
              onClick={() => router.push(`/contacts/${activeContact.id}`)}
            >
              <User className="h-3.5 w-3.5" />
              Abrir Cliente 360
            </Button>

            {editingContact ? (
              <div className="border-border bg-muted/30 space-y-2 rounded-md border p-3">
                <FieldIcon icon={User}>
                  <Input
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Name"
                    className="border-border bg-card h-8 text-xs"
                  />
                </FieldIcon>
                <FieldIcon icon={CalendarClock}>
                  <Input
                    value={draft.clientReference}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        clientReference: event.target.value,
                      }))
                    }
                    placeholder="Ref. cliente"
                    className="border-border bg-card h-8 text-xs"
                  />
                </FieldIcon>
                <FieldIcon icon={Phone}>
                  <Input
                    value={draft.phone}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        phone: event.target.value,
                      }))
                    }
                    placeholder="Phone"
                    className="border-border bg-card h-8 text-xs"
                  />
                </FieldIcon>
                <FieldIcon icon={Mail}>
                  <Input
                    value={draft.email}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        email: event.target.value,
                      }))
                    }
                    placeholder="Email"
                    className="border-border bg-card h-8 text-xs"
                  />
                </FieldIcon>
                <FieldIcon icon={Building2}>
                  <Input
                    value={draft.company}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        company: event.target.value,
                      }))
                    }
                    placeholder="Company"
                    className="border-border bg-card h-8 text-xs"
                  />
                </FieldIcon>
                <Button
                  size="sm"
                  onClick={handleSaveContact}
                  disabled={savingContact || !draft.phone.trim()}
                  className="h-8 w-full"
                >
                  {savingContact ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save contact
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={handleCopyPhone}
                  className="text-muted-foreground hover:bg-muted hover:text-foreground flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                >
                  <Phone className="h-3.5 w-3.5" />
                  <span className="min-w-0 flex-1 truncate text-left">
                    {activeContact.phone}
                  </span>
                  {copied ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
                {activeContact.email && (
                  <InfoRow icon={Mail} text={activeContact.email} />
                )}
                {activeContact.company && (
                  <InfoRow icon={Building2} text={activeContact.company} />
                )}
              </div>
            )}
          </section>

          <Section
            title="Agendamentos"
            icon={CalendarClock}
            defaultOpen
            summary={`${appointments.length} ligados`}
          >
            {appointments.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                Nenhum agendamento ligado a este contato.
              </p>
            ) : (
              <div className="space-y-2">
                {appointments.map((appointment) => (
                  <div
                    key={appointment.id}
                    className="border-border bg-muted/30 rounded-md border p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-foreground truncate text-xs font-semibold">
                          {appointment.service?.name ?? 'Serviço'}
                        </p>
                        <p className="text-muted-foreground text-[11px]">
                          {format(
                            new Date(appointment.scheduled_start),
                            'dd/MM/yyyy HH:mm'
                          )}
                        </p>
                        <p className="text-muted-foreground text-[11px]">
                          {appointment.professional?.full_name ??
                            appointment.professional?.email ??
                            'Sem profissional'}
                        </p>
                      </div>
                      <span className="bg-card text-muted-foreground rounded-full px-2 py-0.5 text-[10px]">
                        {formatAppointmentStatus(appointment.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Benefícios"
            icon={Gift}
            defaultOpen
            summary={`${activeVouchers.length} vouchers · ${activePacks.length} packs`}
          >
            {activeVouchers.length === 0 && activePacks.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                Este cliente não possui vouchers ou packs ativos.
              </p>
            ) : (
              <div className="space-y-2">
                {activeVouchers.map((voucher) => (
                  <div
                    key={voucher.id}
                    className="border-border rounded-md border bg-rose-500/5 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-xs font-semibold">
                          <Gift className="size-3.5 text-rose-500" />
                          Voucher {voucher.code}
                        </p>
                        <p className="text-muted-foreground mt-1 text-[11px]">
                          {voucher.expires_at
                            ? `Válido até ${format(new Date(voucher.expires_at), 'dd/MM/yyyy')}`
                            : 'Sem data limite'}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-rose-600 dark:text-rose-300">
                        {formatCurrency(
                          Number(voucher.current_balance),
                          voucher.currency || defaultCurrency
                        )}
                      </span>
                    </div>
                  </div>
                ))}
                {activePacks.map((clientPack) => (
                  <div
                    key={clientPack.id}
                    className="border-border rounded-md border bg-sky-500/5 p-3"
                  >
                    <p className="flex items-center gap-1.5 text-xs font-semibold">
                      <PackageCheck className="size-3.5 text-sky-500" />
                      {clientPack.pack?.name ?? 'Pack de serviços'}
                    </p>
                    <div className="mt-2 space-y-1">
                      {(clientPack.balances ?? [])
                        .filter(
                          (balance) => Number(balance.remaining_sessions) > 0
                        )
                        .map((balance) => (
                          <div
                            key={balance.id}
                            className="text-muted-foreground flex items-center justify-between gap-2 text-[11px]"
                          >
                            <span className="truncate">
                              {balance.service?.name ?? 'Serviço'}
                            </span>
                            <strong className="text-foreground shrink-0">
                              {balance.remaining_sessions} sessões
                            </strong>
                          </div>
                        ))}
                    </div>
                    <p className="text-muted-foreground mt-2 text-[10px]">
                      {clientPack.expires_at
                        ? `Válido até ${format(new Date(clientPack.expires_at), 'dd/MM/yyyy')}`
                        : 'Sem data limite'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Tags"
            icon={TagIcon}
            defaultOpen
            summary={`${contactTags.length} linked`}
          >
            <div className="flex flex-wrap gap-1.5">
              {contactTags.length === 0 ? (
                <p className="text-muted-foreground text-xs">No tags</p>
              ) : (
                contactTags.map((tag) => (
                  <span
                    key={tag.contact_tag_id}
                    className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    <span className="truncate">{tag.name}</span>
                    <button
                      type="button"
                      onClick={() => void handleRemoveTag(tag.contact_tag_id)}
                      disabled={removingTagId === tag.contact_tag_id}
                      className="hover:bg-background/30 rounded-full"
                      title="Remove tag"
                    >
                      {removingTagId === tag.contact_tag_id ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <X className="h-2.5 w-2.5" />
                      )}
                    </button>
                  </span>
                ))
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <select
                value={selectedTagId}
                onChange={(event) => setSelectedTagId(event.target.value)}
                className="border-border bg-muted text-foreground focus:border-primary h-8 min-w-0 flex-1 rounded-md border px-2 text-xs outline-none"
              >
                <option value="">Add tag...</option>
                {availableTags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={handleAddTag}
                disabled={!selectedTagId || addingTag}
                className="h-8 w-8 shrink-0 p-0"
                title="Add tag"
              >
                {addingTag ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </Section>

          <Section
            title="Custom fields"
            icon={SlidersHorizontal}
            summary={`${customFields.length} fields`}
          >
            {loadingData ? (
              <p className="text-muted-foreground text-xs">Loading fields...</p>
            ) : customFields.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No custom fields configured.
              </p>
            ) : (
              <div className="space-y-2">
                {customFields.map((field) => (
                  <label key={field.id} className="block space-y-1">
                    <span className="text-muted-foreground text-[10px] font-medium uppercase">
                      {field.field_name}
                    </span>
                    <Input
                      value={customValues[field.id] ?? ''}
                      onChange={(event) =>
                        setCustomValues((prev) => ({
                          ...prev,
                          [field.id]: event.target.value,
                        }))
                      }
                      placeholder="Empty"
                      className="border-border bg-muted h-8 text-xs"
                    />
                  </label>
                ))}
                <Button
                  size="sm"
                  onClick={handleSaveCustomFields}
                  disabled={savingCustomFields}
                  className="h-8 w-full"
                >
                  {savingCustomFields ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save fields
                </Button>
              </div>
            )}
          </Section>

          <Section
            title="Deals"
            icon={DollarSign}
            defaultOpen
            summary={`${openDeals.length} active`}
            action={
              <button
                type="button"
                onClick={() => setDealOpen((prev) => !prev)}
                className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-7 w-7 items-center justify-center rounded-md"
                title={dealOpen ? 'Close deal form' : 'Create deal'}
              >
                {dealOpen ? (
                  <X className="h-3.5 w-3.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
              </button>
            }
          >
            {dealOpen && (
              <div className="border-border bg-muted/30 mb-3 space-y-2 rounded-md border p-3">
                <Input
                  value={dealTitle}
                  onChange={(event) => setDealTitle(event.target.value)}
                  placeholder="Deal title"
                  className="border-border bg-card h-8 text-xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    value={dealValue}
                    onChange={(event) => setDealValue(event.target.value)}
                    placeholder="Value"
                    className="border-border bg-card h-8 text-xs"
                  />
                  <select
                    value={dealPipelineId}
                    onChange={(event) => setDealPipelineId(event.target.value)}
                    className="border-border bg-card text-foreground focus:border-primary h-8 rounded-md border px-2 text-xs outline-none"
                  >
                    <option value="">Pipeline</option>
                    {pipelines.map((pipeline) => (
                      <option key={pipeline.id} value={pipeline.id}>
                        {pipeline.name}
                      </option>
                    ))}
                  </select>
                </div>
                <select
                  value={dealStageId}
                  onChange={(event) => setDealStageId(event.target.value)}
                  className="border-border bg-card text-foreground focus:border-primary h-8 w-full rounded-md border px-2 text-xs outline-none"
                >
                  <option value="">Stage</option>
                  {availableStages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </select>
                <Textarea
                  value={dealNotes}
                  onChange={(event) => setDealNotes(event.target.value)}
                  placeholder="Internal deal note"
                  rows={2}
                  className="border-border bg-card min-h-14 resize-none text-xs"
                />
                <Button
                  size="sm"
                  onClick={handleCreateDeal}
                  disabled={
                    savingDeal ||
                    !dealTitle.trim() ||
                    !dealPipelineId ||
                    !dealStageId ||
                    pipelines.length === 0
                  }
                  className="h-8 w-full"
                >
                  {savingDeal ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Create deal
                </Button>
              </div>
            )}

            <div className="space-y-2">
              {loadingData ? (
                <p className="text-muted-foreground text-xs">
                  Loading CRM data...
                </p>
              ) : deals.length === 0 ? (
                <p className="text-muted-foreground text-xs">No deals linked</p>
              ) : (
                deals.map((deal) => {
                  const dealStages =
                    stagesByPipelineId.get(deal.pipeline_id) ?? [];
                  const updating = updatingDealId === deal.id;
                  return (
                    <div
                      key={deal.id}
                      className="border-border bg-muted/30 space-y-2 rounded-md border p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-foreground truncate text-xs font-medium">
                            {deal.title}
                          </p>
                          <p className="text-muted-foreground mt-0.5 text-[11px]">
                            {formatCurrency(
                              deal.value,
                              deal.currency ?? defaultCurrency
                            )}
                          </p>
                        </div>
                        <span className="bg-card text-muted-foreground rounded-full px-2 py-0.5 text-[10px]">
                          {formatDealStatus(deal.status)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={deal.pipeline_id}
                          onChange={(event) =>
                            handleDealPipelineChange(deal, event.target.value)
                          }
                          disabled={updating}
                          className="border-border bg-card text-foreground focus:border-primary h-8 rounded-md border px-2 text-[11px] outline-none"
                        >
                          {pipelines.map((pipeline) => (
                            <option key={pipeline.id} value={pipeline.id}>
                              {pipeline.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={deal.stage_id}
                          onChange={(event) =>
                            handleDealStageChange(deal, event.target.value)
                          }
                          disabled={updating}
                          className="border-border bg-card text-foreground focus:border-primary h-8 rounded-md border px-2 text-[11px] outline-none"
                        >
                          {dealStages.map((stage) => (
                            <option key={stage.id} value={stage.id}>
                              {stage.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={
                            DEAL_STATUS_OPTIONS.some(
                              (option) => option.value === deal.status
                            )
                              ? deal.status
                              : 'open'
                          }
                          onChange={(event) =>
                            handleDealStatusChange(
                              deal,
                              event.target.value as DealStatus
                            )
                          }
                          disabled={updating}
                          className="border-border bg-card text-foreground focus:border-primary h-8 min-w-0 flex-1 rounded-md border px-2 text-[11px] outline-none"
                        >
                          {DEAL_STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {updating && (
                          <Loader2 className="text-muted-foreground h-3.5 w-3.5 animate-spin" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Section>

          <Section
            title="Notes"
            icon={StickyNote}
            summary={`${notes.length} notes`}
          >
            <div className="flex gap-2">
              <Textarea
                value={newNote}
                onChange={(event) => setNewNote(event.target.value)}
                placeholder="Add an internal note"
                rows={2}
                className="border-border bg-muted min-h-16 flex-1 resize-none text-xs"
              />
              <Button
                size="sm"
                className="h-auto w-8 shrink-0 p-0"
                onClick={handleAddNote}
                disabled={!newNote.trim() || addingNote}
                title="Add note"
              >
                {addingNote ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>

            <div className="mt-2 space-y-2">
              {notes.length === 0 ? (
                <p className="text-muted-foreground text-xs">No notes yet</p>
              ) : (
                notes.slice(0, 4).map((note) => (
                  <div key={note.id} className="bg-muted rounded-md px-3 py-2">
                    <p className="text-foreground text-xs whitespace-pre-wrap">
                      {note.note_text}
                    </p>
                    <p className="text-muted-foreground mt-1 text-[10px]">
                      {format(new Date(note.created_at), 'MMM d, yyyy HH:mm')}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Section>

          <Section
            title="Timeline"
            icon={History}
            summary={`${timelineEvents.length} events`}
          >
            {timelineEvents.length === 0 ? (
              <p className="text-muted-foreground text-xs">No activity yet</p>
            ) : (
              <div className="space-y-2">
                {timelineEvents.map((event) => (
                  <div
                    key={event.id}
                    className="grid grid-cols-[12px_minmax(0,1fr)] gap-2"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 rounded-full ${timelineToneClass(
                        event.tone
                      )}`}
                    />
                    <div className="bg-muted/60 min-w-0 rounded-md px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-foreground truncate text-[11px] font-medium">
                          {event.title}
                        </p>
                        <span className="text-muted-foreground shrink-0 text-[10px]">
                          {format(new Date(event.createdAt), 'MMM d HH:mm')}
                        </span>
                      </div>
                      <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[11px]">
                        {event.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {automationLogs.length > 0 && (
            <Section
              title="Automations"
              icon={Workflow}
              summary={`${automationLogs.length} runs`}
            >
              <div className="space-y-2">
                {automationLogs.slice(0, 4).map((log) => (
                  <div key={log.id} className="bg-muted rounded-md px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-foreground truncate text-xs font-medium">
                        {automationName(log)}
                      </p>
                      <span className="bg-card text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px]">
                        {log.status}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 text-[10px]">
                      {format(new Date(log.created_at), 'MMM d, yyyy HH:mm')}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  action,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: LucideIcon;
  action?: ReactNode;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border-border bg-muted/25 overflow-hidden rounded-md border">
      <div className="border-border/70 bg-card/80 flex items-center gap-2 border-b px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <Icon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wide uppercase">
            {title}
          </span>
          {summary && (
            <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium">
              {summary}
            </span>
          )}
          <ChevronDown
            className={`text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>
        {open && action}
      </div>
      {open && <div className="p-3">{children}</div>}
    </section>
  );
}

function InfoRow({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="text-muted-foreground flex items-center gap-2 rounded-md px-2 py-1.5 text-xs">
      <Icon className="h-3.5 w-3.5" />
      <span className="min-w-0 truncate">{text}</span>
    </div>
  );
}

function FieldIcon({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[18px_minmax(0,1fr)] items-center gap-2">
      <Icon className="text-muted-foreground h-3.5 w-3.5" />
      {children}
    </div>
  );
}
