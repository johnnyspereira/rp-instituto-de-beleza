'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Contact, ConversationStatus, DealStatus, Tag } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Search,
  Plus,
  Upload,
  FileDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Users,
  UserCheck,
  UserRoundCheck,
  UserRoundX,
  MessageCircle,
  Briefcase,
  StickyNote,
  Copy,
  Check,
  Mail,
  Building2,
  Phone,
  Clock3,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Filter,
  Bookmark,
  X,
  CalendarDays,
  Gift,
  PackageCheck,
  BadgeEuro,
  GitMerge,
  MonitorSmartphone,
} from 'lucide-react';
import { ContactForm } from '@/components/contacts/contact-form';
import { ImportModal } from '@/components/contacts/import-modal';
import { CustomFieldsManager } from '@/components/contacts/custom-fields-manager';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrencyShort } from '@/lib/currency';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

interface ContactWithTags extends Contact {
  tags?: Tag[];
}

type ContactSegment =
  | 'all'
  | 'needs_info'
  | 'complete'
  | 'untagged'
  | 'new_today'
  | 'with_conversations'
  | 'with_deals'
  | 'with_portal';

interface ContactInsight {
  conversationCount: number;
  openConversationCount: number;
  unreadCount: number;
  lastConversationId: string | null;
  lastMessageAt: string | null;
  activeDealCount: number;
  activeDealValue: number;
  notesCount: number;
  appointmentCount: number;
  upcomingAppointmentCount: number;
  totalPaid: number;
  balanceDue: number;
  activeVoucherCount: number;
  activePackCount: number;
}

type PortalAccessListRow = {
  contact_id: string;
  last_login_at: string | null;
};

type SavedAudienceConfig = {
  type: 'all' | 'tags' | 'custom_field' | 'csv';
  tagIds?: string[];
  excludeTagIds?: string[];
  customField?: {
    fieldId: string;
    operator: 'is' | 'is_not' | 'contains';
    value: string;
  };
};

interface SavedContactSegment {
  id: string;
  name: string;
  config: SavedAudienceConfig;
}

const EMPTY_INSIGHT: ContactInsight = {
  conversationCount: 0,
  openConversationCount: 0,
  unreadCount: 0,
  lastConversationId: null,
  lastMessageAt: null,
  activeDealCount: 0,
  activeDealValue: 0,
  notesCount: 0,
  appointmentCount: 0,
  upcomingAppointmentCount: 0,
  totalPaid: 0,
  balanceDue: 0,
  activeVoucherCount: 0,
  activePackCount: 0,
};

const CONTACT_SEGMENTS = [
  { key: 'all', icon: Users },
  { key: 'needs_info', icon: UserRoundX },
  { key: 'complete', icon: UserRoundCheck },
  { key: 'untagged', icon: Filter },
  { key: 'new_today', icon: Clock3 },
  { key: 'with_conversations', icon: MessageCircle },
  { key: 'with_deals', icon: Briefcase },
  { key: 'with_portal', icon: MonitorSmartphone },
] satisfies { key: ContactSegment; icon: typeof Users }[];

export default function ContactsPage() {
  const t = useTranslations('Contacts.page');
  const supabase = createClient();
  const router = useRouter();
  const { accountId, defaultCurrency } = useAuth();
  const canEdit = useCan('send-messages');
  const canEditSettings = useCan('edit-settings');

  const [contacts, setContacts] = useState<ContactWithTags[]>([]);
  const [contactInsights, setContactInsights] = useState<
    Record<string, ContactInsight>
  >({});
  const [portalAccessByContact, setPortalAccessByContact] = useState<
    Record<string, PortalAccessListRow>
  >({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [segment, setSegment] = useState<ContactSegment>('all');
  const [advancedFilterAvailable, setAdvancedFilterAvailable] = useState(true);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);
  // Tag filter — contacts shown must have ANY of these tags (OR).
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [savedSegments, setSavedSegments] = useState<SavedContactSegment[]>([]);
  const [selectedSavedSegmentId, setSelectedSavedSegmentId] = useState('');

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [customFieldsOpen, setCustomFieldsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);

  // Bulk selection (page-scoped — only the loaded rows are selectable)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  // All tags for display
  const [tagsMap, setTagsMap] = useState<Record<string, Tag>>({});

  // Guards against out-of-order fetch responses: each fetchContacts run
  // claims a sequence number and only the latest is allowed to commit its
  // results. Without this, rapidly toggling tag filters could let a slower
  // earlier request resolve last and render stale rows.
  const fetchSeq = useRef(0);

  const fetchTags = useCallback(async () => {
    const { data } = await supabase.from('tags').select('*');
    if (data) {
      const map: Record<string, Tag> = {};
      data.forEach((t) => (map[t.id] = t));
      setTagsMap(map);
      // Drop any filter selections whose tag no longer exists (e.g. a tag
      // deleted elsewhere) so it can't linger invisibly in the query.
      setSelectedTagIds((prev) => {
        const pruned = prev.filter((id) => map[id]);
        return pruned.length === prev.length ? prev : pruned;
      });
    }
  }, [supabase]);

  const fetchSavedSegments = useCallback(async () => {
    if (!accountId) return;
    const { data } = await supabase
      .from('contact_segments')
      .select('id, name, config')
      .eq('account_id', accountId)
      .order('name');
    setSavedSegments((data ?? []) as SavedContactSegment[]);
  }, [accountId, supabase]);

  const fetchContactInsights = useCallback(
    async (contactIds: string[], seq: number) => {
      if (contactIds.length === 0) {
        setContactInsights({});
        setPortalAccessByContact({});
        return;
      }

      const [
        conversationsRes,
        dealsRes,
        notesRes,
        appointmentsRes,
        salesRes,
        vouchersRes,
        packsRes,
        portalAccessRes,
      ] = await Promise.all([
        supabase
          .from('conversations')
          .select(
            'id, contact_id, status, last_message_at, unread_count, created_at'
          )
          .in('contact_id', contactIds)
          .order('last_message_at', { ascending: false, nullsFirst: false }),
        supabase
          .from('deals')
          .select('id, contact_id, status, value')
          .in('contact_id', contactIds),
        supabase
          .from('contact_notes')
          .select('id, contact_id')
          .in('contact_id', contactIds),
        supabase
          .from('clinic_appointments')
          .select('id, contact_id, status, scheduled_start')
          .in('contact_id', contactIds),
        supabase
          .from('finance_sales')
          .select('contact_id, paid_amount, balance_due')
          .in('contact_id', contactIds),
        supabase
          .from('finance_vouchers')
          .select('owner_contact_id, status')
          .in('owner_contact_id', contactIds),
        supabase
          .from('finance_client_packs')
          .select('contact_id, status')
          .in('contact_id', contactIds),
        supabase
          .from('client_portal_access')
          .select('contact_id,last_login_at')
          .in('contact_id', contactIds),
      ]);

      if (seq !== fetchSeq.current) return;

      const next: Record<string, ContactInsight> = Object.fromEntries(
        contactIds.map((id) => [id, { ...EMPTY_INSIGHT }])
      );

      type ConversationRow = {
        id: string;
        contact_id: string;
        status: ConversationStatus;
        last_message_at?: string | null;
        unread_count?: number | null;
        created_at: string;
      };

      for (const conversation of (conversationsRes.data ??
        []) as ConversationRow[]) {
        const insight = next[conversation.contact_id];
        if (!insight) continue;
        const activityAt =
          conversation.last_message_at ?? conversation.created_at;

        insight.conversationCount += 1;
        insight.unreadCount += Number(conversation.unread_count ?? 0);
        if (conversation.status !== 'closed')
          insight.openConversationCount += 1;
        if (
          !insight.lastMessageAt ||
          Date.parse(activityAt) > Date.parse(insight.lastMessageAt)
        ) {
          insight.lastMessageAt = activityAt;
          insight.lastConversationId = conversation.id;
        }
      }

      type DealRow = {
        contact_id: string | null;
        status?: DealStatus | null;
        value?: number | null;
      };

      for (const deal of (dealsRes.data ?? []) as DealRow[]) {
        if (!deal.contact_id || deal.status !== 'open') continue;
        const insight = next[deal.contact_id];
        if (!insight) continue;
        insight.activeDealCount += 1;
        insight.activeDealValue += Number(deal.value ?? 0);
      }

      type NoteRow = { contact_id: string };
      for (const note of (notesRes.data ?? []) as NoteRow[]) {
        const insight = next[note.contact_id];
        if (insight) insight.notesCount += 1;
      }

      const now = Date.now();
      for (const appointment of appointmentsRes.data ?? []) {
        if (!appointment.contact_id || !next[appointment.contact_id]) continue;
        const insight = next[appointment.contact_id];
        insight.appointmentCount += 1;
        if (
          new Date(appointment.scheduled_start).getTime() >= now &&
          !['cancelled', 'no_show'].includes(appointment.status)
        ) {
          insight.upcomingAppointmentCount += 1;
        }
      }
      for (const sale of salesRes.data ?? []) {
        if (!sale.contact_id || !next[sale.contact_id]) continue;
        next[sale.contact_id].totalPaid += Number(sale.paid_amount ?? 0);
        next[sale.contact_id].balanceDue += Number(sale.balance_due ?? 0);
      }
      for (const voucher of vouchersRes.data ?? []) {
        if (
          voucher.owner_contact_id &&
          next[voucher.owner_contact_id] &&
          voucher.status === 'active'
        ) {
          next[voucher.owner_contact_id].activeVoucherCount += 1;
        }
      }
      for (const pack of packsRes.data ?? []) {
        if (
          pack.contact_id &&
          next[pack.contact_id] &&
          pack.status === 'active'
        ) {
          next[pack.contact_id].activePackCount += 1;
        }
      }

      setContactInsights(next);
      setPortalAccessByContact(
        Object.fromEntries(
          ((portalAccessRes.data ?? []) as PortalAccessListRow[]).map((row) => [
            row.contact_id,
            row,
          ])
        )
      );
    },
    [supabase]
  );

  const fetchFallbackRows = useCallback(
    async (term: string) => {
      let query = supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5000);

      if (term) {
        const like = `%${term}%`;
        query = query.or(
          `name.ilike.${like},phone.ilike.${like},email.ilike.${like},company.ilike.${like},client_reference.ilike.${like}`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as Contact[];
      if (rows.length === 0) return rows;

      const [contactTagsRes, conversationsRes, dealsRes, portalAccessRes] = await Promise.all([
        supabase.from('contact_tags').select('contact_id, tag_id').limit(10000),
        supabase.from('conversations').select('contact_id').limit(10000),
        supabase
          .from('deals')
          .select('contact_id, status')
          .eq('status', 'open')
          .limit(10000),
        supabase.from('client_portal_access').select('contact_id').limit(10000),
      ]);

      const tagsByContact = new Map<string, Set<string>>();
      for (const item of contactTagsRes.data ?? []) {
        const current = tagsByContact.get(item.contact_id) ?? new Set<string>();
        current.add(item.tag_id);
        tagsByContact.set(item.contact_id, current);
      }

      const selectedSavedSegment = savedSegments.find(
        (item) => item.id === selectedSavedSegmentId
      );
      let customFieldMatches: Set<string> | null = null;
      const customField = selectedSavedSegment?.config.customField;
      if (
        selectedSavedSegment?.config.type === 'custom_field' &&
        customField?.fieldId &&
        customField.value
      ) {
        let query = supabase
          .from('contact_custom_values')
          .select('contact_id')
          .eq('custom_field_id', customField.fieldId);
        if (customField.operator === 'is') query = query.eq('value', customField.value);
        else if (customField.operator === 'is_not') {
          query = query.neq('value', customField.value);
        } else {
          query = query.ilike('value', `%${customField.value}%`);
        }
        const { data: matches } = await query.limit(10000);
        customFieldMatches = new Set((matches ?? []).map((item) => item.contact_id));
      }
      const contactsWithConversations = new Set(
        (conversationsRes.data ?? []).map((item) => item.contact_id)
      );
      const contactsWithOpenDeals = new Set(
        (dealsRes.data ?? [])
          .map((item) => item.contact_id)
          .filter((id): id is string => Boolean(id))
      );
      const contactsWithPortal = new Set(
        (portalAccessRes.data ?? []).map((item) => item.contact_id)
      );
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      return rows.filter((contact) => {
        const contactTags = tagsByContact.get(contact.id) ?? new Set<string>();
        if (selectedSavedSegment) {
          const cfg = selectedSavedSegment.config;
          if (
            cfg.type === 'tags' &&
            (cfg.tagIds?.length ?? 0) > 0 &&
            !cfg.tagIds!.some((tagId) => contactTags.has(tagId))
          ) {
            return false;
          }
          if (cfg.type === 'custom_field' && !customFieldMatches?.has(contact.id)) {
            return false;
          }
          if (
            (cfg.excludeTagIds?.length ?? 0) > 0 &&
            cfg.excludeTagIds!.some((tagId) => contactTags.has(tagId))
          ) {
            return false;
          }
        }
        if (
          selectedTagIds.length > 0 &&
          !selectedTagIds.some((tagId) => contactTags.has(tagId))
        ) {
          return false;
        }

        const complete =
          Boolean(contact.name?.trim()) &&
          Boolean(contact.phone?.trim()) &&
          Boolean(contact.email?.trim()) &&
          Boolean(contact.company?.trim()) &&
          contactTags.size > 0;

        if (segment === 'needs_info') return !complete;
        if (segment === 'complete') return complete;
        if (segment === 'untagged') return contactTags.size === 0;
        if (segment === 'new_today') {
          return (
            new Date(contact.created_at).getTime() >= startOfToday.getTime()
          );
        }
        if (segment === 'with_conversations') {
          return contactsWithConversations.has(contact.id);
        }
        if (segment === 'with_deals') {
          return contactsWithOpenDeals.has(contact.id);
        }
        if (segment === 'with_portal') {
          return contactsWithPortal.has(contact.id);
        }
        return true;
      });
    },
    [savedSegments, segment, selectedSavedSegmentId, selectedTagIds, supabase]
  );

  const fetchContacts = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    // The visible rows are about to change — drop any selection that
    // referred to the old page/search results so the bulk bar can't
    // act on rows the user can no longer see.
    setSelected(new Set());
    setContactInsights({});

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const term = search.trim();

    let contactRows: Contact[] = [];
    let count = 0;
    let usedAdvancedFilter = false;

    if (advancedFilterAvailable && !selectedSavedSegmentId) {
      const { data, error } = await supabase.rpc('filter_contacts_advanced', {
        p_tag_ids: selectedTagIds,
        p_search: term || null,
        p_segment: segment,
        p_limit: PAGE_SIZE,
        p_offset: from,
      });
      if (seq !== fetchSeq.current) return;

      if (!error) {
        const rows = (data ?? []) as {
          contact: Contact;
          total_count: number;
        }[];
        contactRows = rows.map((r) => r.contact);
        count = rows.length > 0 ? Number(rows[0].total_count) : 0;
        usedAdvancedFilter = true;
      } else {
        setAdvancedFilterAvailable(false);
      }
    }

    if (!usedAdvancedFilter && (segment !== 'all' || selectedSavedSegmentId)) {
      try {
        const fallbackRows = await fetchFallbackRows(term);
        contactRows = fallbackRows.slice(from, to + 1);
        count = fallbackRows.length;
        usedAdvancedFilter = true;
      } catch {
        toast.error(t('toastFailedLoad'));
        setLoading(false);
        return;
      }
    }

    if (!usedAdvancedFilter && selectedTagIds.length > 0) {
      // Tag filter active — resolve it server-side (join + distinct +
      // windowed total count + pagination) so a tag covering many
      // contacts can't silently truncate the result or overflow an IN
      // clause. See migration 025_filter_contacts_by_tags.
      const { data, error } = await supabase.rpc('filter_contacts_by_tags', {
        p_tag_ids: selectedTagIds,
        p_search: term || null,
        p_limit: PAGE_SIZE,
        p_offset: from,
      });
      if (seq !== fetchSeq.current) return; // superseded by a newer fetch
      if (error) {
        try {
          const fallbackRows = await fetchFallbackRows(term);
          contactRows = fallbackRows.slice(from, to + 1);
          count = fallbackRows.length;
          usedAdvancedFilter = true;
        } catch {
          toast.error(t('toastFailedLoad'));
          setLoading(false);
          return;
        }
      } else {
        const rows = (data ?? []) as {
          contact: Contact;
          total_count: number;
        }[];
        contactRows = rows.map((r) => r.contact);
        count = rows.length > 0 ? Number(rows[0].total_count) : 0;
      }
    } else if (!usedAdvancedFilter) {
      let query = supabase
        .from('contacts')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (term) {
        const like = `%${term}%`;
        query = query.or(
          `name.ilike.${like},phone.ilike.${like},email.ilike.${like},company.ilike.${like},client_reference.ilike.${like}`
        );
      }

      const { data, count: exactCount, error } = await query;
      if (seq !== fetchSeq.current) return; // superseded by a newer fetch
      if (error) {
        toast.error(t('toastFailedLoad'));
        setLoading(false);
        return;
      }
      contactRows = data ?? [];
      count = exactCount ?? 0;
    }

    setTotalCount(count);

    if (contactRows.length === 0) {
      setContacts([]);
      setContactInsights({});
      setLoading(false);
      return;
    }

    // Fetch tags for these contacts
    const contactIds = contactRows.map((c) => c.id);
    const { data: contactTags } = await supabase
      .from('contact_tags')
      .select('contact_id, tag_id')
      .in('contact_id', contactIds);
    if (seq !== fetchSeq.current) return; // superseded by a newer fetch

    const tagsByContact: Record<string, string[]> = {};
    contactTags?.forEach((ct) => {
      if (!tagsByContact[ct.contact_id]) tagsByContact[ct.contact_id] = [];
      tagsByContact[ct.contact_id].push(ct.tag_id);
    });

    const enriched: ContactWithTags[] = contactRows.map((c) => ({
      ...c,
      tags: (tagsByContact[c.id] ?? [])
        .map((tid) => tagsMap[tid])
        .filter(Boolean),
    }));

    setContacts(enriched);
    setLoading(false);
    void fetchContactInsights(contactIds, seq);
  }, [
    advancedFilterAvailable,
    fetchFallbackRows,
    fetchContactInsights,
    page,
    search,
    segment,
    selectedSavedSegmentId,
    selectedTagIds,
    supabase,
    tagsMap,
    t,
  ]);

  // Load-once-on-mount-ish data fetches. Each setter inside runs
  // inside an async promise completion (Supabase await), not
  // synchronously in the effect body, so the cascade the lint rule
  // warns about doesn't apply here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTags();
    fetchSavedSegments();
  }, [fetchSavedSegments, fetchTags]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContacts();
  }, [fetchContacts]);

  function openAddForm() {
    setFormOpen(true);
  }

  function openEditClient(contactId: string) {
    router.push(`/contacts/${contactId}?edit=1`);
  }

  function openClient360(contactId: string) {
    router.push(`/contacts/${contactId}`);
  }

  function confirmDelete(contact: Contact) {
    setDeleteTarget(contact);
    setDeleteConfirmOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', deleteTarget.id);

    if (error) {
      toast.error(t('toastFailedDelete'));
    } else {
      toast.success(t('toastDeleted'));
      fetchContacts();
    }

    setDeleting(false);
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  }

  const allOnPageSelected =
    contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  const someOnPageSelected = contacts.some((c) => selected.has(c.id));
  const allResultsSelected = totalCount > 0 && selected.size === totalCount;

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        contacts.forEach((c) => next.delete(c.id));
      } else {
        contacts.forEach((c) => next.add(c.id));
      }
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedContacts = contacts.filter((contact) => selected.has(contact.id));
  const canMergeSelectedContacts = selectedContacts.length === 2 && selected.size === 2;

  function openMergeDialog() {
    if (!canMergeSelectedContacts) {
      toast.error('Selecione exatamente dois clientes da pagina para os unir.');
      return;
    }
    const firstReferenceContact = [...selectedContacts].sort((left, right) => {
      const leftReference = Number(left.client_reference);
      const rightReference = Number(right.client_reference);
      if (Number.isFinite(leftReference) && Number.isFinite(rightReference)) {
        return leftReference - rightReference;
      }
      if (Number.isFinite(leftReference)) return -1;
      if (Number.isFinite(rightReference)) return 1;
      return left.created_at.localeCompare(right.created_at);
    })[0];
    setMergeTargetId(firstReferenceContact.id);
    setMergeOpen(true);
  }

  async function handleMergeContacts() {
    if (!mergeTargetId || !canMergeSelectedContacts) return;
    const source = selectedContacts.find((contact) => contact.id !== mergeTargetId);
    if (!source) return;

    setMerging(true);
    const { error } = await supabase.rpc('merge_contacts', {
      p_source_contact_id: source.id,
      p_target_contact_id: mergeTargetId,
    });
    setMerging(false);

    if (error) {
      toast.error(error.message || 'Nao foi possivel unir os clientes.');
      return;
    }

    toast.success('Clientes unidos. O historico foi mantido no registo escolhido.');
    setMergeOpen(false);
    setMergeTargetId(null);
    setSelected(new Set());
    await fetchContacts();
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setDeleting(true);

    let deleteError: { message: string } | null = null;
    for (let index = 0; index < ids.length; index += 100) {
      const batch = ids.slice(index, index + 100);
      const { error } = await supabase
        .from('contacts')
        .delete()
        .in('id', batch);
      if (error) {
        deleteError = error;
        break;
      }
    }

    if (deleteError) {
      toast.error(t('toastBulkFailedDelete'));
    } else {
      toast.success(t('toastBulkDeleted', { count: ids.length }));
      setSelected(new Set());
      fetchContacts();
    }

    setDeleting(false);
    setBulkDeleteOpen(false);
  }

  async function copyPhone(
    contact: Contact,
    event: React.MouseEvent<HTMLButtonElement>
  ) {
    event.stopPropagation();
    await navigator.clipboard.writeText(contact.phone);
    setCopiedPhoneId(contact.id);
    setTimeout(() => setCopiedPhoneId(null), 1600);
    toast.success(t('toastPhoneCopied'));
  }

  function openInboxForContact(
    contact: Contact,
    event: React.MouseEvent<HTMLButtonElement>
  ) {
    event.stopPropagation();
    const conversationId = contactInsights[contact.id]?.lastConversationId;
    if (conversationId) {
      router.push(`/inbox?c=${conversationId}`);
      return;
    }
    openClient360(contact.id);
    toast.info(t('toastNoConversationYet'));
  }

  function selectSegment(nextSegment: ContactSegment) {
    setSegment(nextSegment);
    setPage(0);
  }

  function applySavedSegment(segmentId: string) {
    setSelectedSavedSegmentId(segmentId);
    setPage(0);
  }

  async function selectAllResults() {
    if (totalCount === 0) return;
    setSelectingAll(true);

    try {
      let ids: string[] = [];
      if (advancedFilterAvailable && !selectedSavedSegmentId) {
        const { data, error } = await supabase.rpc('filter_contacts_advanced', {
          p_tag_ids: selectedTagIds,
          p_search: search.trim() || null,
          p_segment: segment,
          p_limit: totalCount,
          p_offset: 0,
        });
        if (!error) {
          ids = ((data ?? []) as { contact: Contact }[]).map(
            (row) => row.contact.id
          );
        }
      }

      if (ids.length === 0) {
        const rows = await fetchFallbackRows(search.trim());
        ids = rows.map((contact) => contact.id);
      }

      setSelected(new Set(ids));
      toast.success(`${ids.length} clientes selecionados.`);
    } catch {
      toast.error('Não foi possível selecionar todos os resultados.');
    } finally {
      setSelectingAll(false);
    }
  }

  function csvCell(value: unknown) {
    const text = value == null ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  }

  function downloadCsv(filename: string, rows: ContactWithTags[]) {
    const headers = [
      'id',
      'referencia',
      'nome',
      'telefone',
      'email',
      'empresa',
      'nif',
      'genero',
      'data_nascimento',
      'morada',
      'codigo_postal',
      'cidade',
      'pais',
      'origem',
      'contacto_preferido',
      'consentimento_marketing',
      'consentimento_whatsapp',
      'tags',
      'criado_em',
      'atualizado_em',
    ];
    const body = rows.map((contact) =>
      [
        contact.id,
        contact.client_reference,
        contact.name,
        contact.phone,
        contact.email,
        contact.company,
        contact.tax_id,
        contact.gender,
        contact.birth_date,
        contact.address_line,
        contact.postal_code,
        contact.city,
        contact.country,
        contact.source,
        contact.preferred_contact,
        contact.marketing_consent ? 'sim' : 'não',
        contact.whatsapp_consent ? 'sim' : 'não',
        contact.tags?.map((tag) => tag.name).join(', '),
        contact.created_at,
        contact.updated_at,
      ]
        .map(csvCell)
        .join(',')
    );
    const csv = `\uFEFF${headers.join(',')}\n${body.join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function enrichExportRows(rows: Contact[]): Promise<ContactWithTags[]> {
    if (rows.length === 0) return [];
    const tagsByContact: Record<string, Tag[]> = {};
    const ids = rows.map((contact) => contact.id);
    for (let index = 0; index < ids.length; index += 500) {
      const chunk = ids.slice(index, index + 500);
      const { data } = await supabase
        .from('contact_tags')
        .select('contact_id, tag:tags(*)')
        .in('contact_id', chunk);
      for (const row of data ?? []) {
        const tagField = row.tag as Tag | Tag[] | null;
        const tag = Array.isArray(tagField) ? tagField[0] : tagField;
        if (!tag) continue;
        if (!tagsByContact[row.contact_id]) tagsByContact[row.contact_id] = [];
        tagsByContact[row.contact_id].push(tag);
      }
    }
    return rows.map((contact) => ({
      ...contact,
      tags: tagsByContact[contact.id] ?? [],
    }));
  }

  async function fetchContactsByIds(ids: string[]) {
    const rows: Contact[] = [];
    for (let index = 0; index < ids.length; index += 500) {
      const chunk = ids.slice(index, index + 500);
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .in('id', chunk)
        .order('created_at', { ascending: false });
      if (error) throw error;
      rows.push(...((data ?? []) as Contact[]));
    }
    return rows;
  }

  async function fetchAllFilteredForExport() {
    const limit = Math.min(totalCount || 0, 10_000);
    if (limit === 0) return [];
    if (totalCount > 10_000) {
      toast.info('Exportando os primeiros 10.000 resultados filtrados.');
    }

    if (advancedFilterAvailable) {
      const { data, error } = await supabase.rpc('filter_contacts_advanced', {
        p_tag_ids: selectedTagIds,
        p_search: search.trim() || null,
        p_segment: segment,
        p_limit: limit,
        p_offset: 0,
      });
      if (!error) {
        return ((data ?? []) as { contact: Contact }[]).map(
          (row) => row.contact
        );
      }
    }

    const fallbackRows = await fetchFallbackRows(search.trim());
    return fallbackRows.slice(0, limit);
  }

  async function exportContacts(scope: 'page' | 'selected' | 'filtered') {
    setExporting(true);
    try {
      let rows: Contact[] = [];
      let label = 'pagina';
      if (scope === 'page') {
        rows = contacts;
      } else if (scope === 'selected') {
        rows = await fetchContactsByIds(Array.from(selected));
        label = 'selecionados';
      } else {
        rows = await fetchAllFilteredForExport();
        label = 'filtrados';
      }

      const enriched = await enrichExportRows(rows);
      if (enriched.length === 0) {
        toast.info('Nenhum cliente para exportar.');
        return;
      }

      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`clientes-${label}-${stamp}.csv`, enriched);
      toast.success(`${enriched.length} cliente(s) exportado(s).`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Não foi possível exportar: ${error.message}`
          : 'Não foi possível exportar clientes.'
      );
    } finally {
      setExporting(false);
    }
  }

  const pageStats = useMemo(() => {
    const completed = contacts.filter(isContactComplete).length;
    const needsInfo = contacts.length - completed;
    const conversations = contacts.filter(
      (contact) => (contactInsights[contact.id]?.conversationCount ?? 0) > 0
    ).length;
    const activeDeals = contacts.reduce(
      (sum, contact) =>
        sum + (contactInsights[contact.id]?.activeDealCount ?? 0),
      0
    );
    const activeDealValue = contacts.reduce(
      (sum, contact) =>
        sum + (contactInsights[contact.id]?.activeDealValue ?? 0),
      0
    );
    const unread = contacts.reduce(
      (sum, contact) => sum + (contactInsights[contact.id]?.unreadCount ?? 0),
      0
    );

    return {
      completed,
      needsInfo,
      conversations,
      activeDeals,
      activeDealValue,
      unread,
    };
  }, [contactInsights, contacts]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNext = page < totalPages - 1;
  const hasPrev = page > 0;

  // Tag filter helpers. Every change resets to page 0 — the result set
  // shrinks/grows so page N may no longer be valid (mirrors the search box).
  const allTags = Object.values(tagsMap).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const hasActiveFilters =
    search.trim().length > 0 ||
    selectedTagIds.length > 0 ||
    selectedSavedSegmentId ||
    segment !== 'all';

  function toggleTagFilter(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
    setPage(0);
  }

  function clearTagFilters() {
    setSelectedTagIds([]);
    setPage(0);
  }

  function clearAllFilters() {
    setSearch('');
    setSelectedTagIds([]);
    setSelectedSavedSegmentId('');
    setSegment('all');
    setPage(0);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="border-border/70 flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="bg-primary-soft text-primary flex size-10 shrink-0 items-center justify-center rounded-md">
              <Users className="size-5" />
            </span>
            <div>
              <h1 className="text-foreground text-2xl font-bold">
                {t('title')}
              </h1>
              <p className="text-muted-foreground mt-0.5 text-sm">
                {totalCount > 0
                  ? t('subtitle', { count: totalCount })
                  : t('subtitleZero')}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEditSettings && (
            <Button
              variant="outline"
              onClick={() => setCustomFieldsOpen(true)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              <SlidersHorizontal className="size-4" />
              {t('customFieldsBtn')}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={exporting || contacts.length === 0}
              className="border-border text-muted-foreground hover:bg-muted inline-flex h-9 items-center justify-center gap-2 rounded-lg border bg-transparent px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileDown className="size-4" />
              )}
              Exportar
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportContacts('page')}>
                Página atual ({contacts.length})
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => exportContacts('filtered')}
                disabled={totalCount === 0}
              >
                Resultados filtrados ({Math.min(totalCount, 10_000)})
              </DropdownMenuItem>
              {selected.size > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => exportContacts('selected')}>
                    Selecionados ({selected.size})
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <GatedButton
            variant="outline"
            canAct={canEdit}
            gateReason="add or import clients"
            onClick={() => setImportOpen(true)}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            <Upload className="size-4" />
            {t('importBtn')}
          </GatedButton>
          <GatedButton
            canAct={canEdit}
            gateReason="add or import clients"
            onClick={openAddForm}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="size-4" />
            {t('addContactBtn')}
          </GatedButton>
        </div>
      </div>

      {/* Contact intelligence */}
      <section className="border-border bg-card grid overflow-hidden rounded-lg border sm:grid-cols-2 xl:grid-cols-5">
        <ContactMetricCard
          icon={Users}
          label={t('stats.total')}
          value={totalCount.toLocaleString()}
          hint={t('stats.totalHint')}
        />
        <ContactMetricCard
          icon={UserCheck}
          label={t('stats.quality')}
          value={`${contacts.length > 0 ? Math.round((pageStats.completed / contacts.length) * 100) : 0}%`}
          hint={t('stats.qualityHint', {
            count: pageStats.completed,
            total: contacts.length,
          })}
        />
        <ContactMetricCard
          icon={UserRoundX}
          label={t('stats.needsInfo')}
          value={pageStats.needsInfo.toLocaleString()}
          hint={t('stats.needsInfoHint')}
        />
        <ContactMetricCard
          icon={MessageCircle}
          label={t('stats.conversations')}
          value={pageStats.conversations.toLocaleString()}
          hint={
            pageStats.unread > 0
              ? t('stats.unreadHint', { count: pageStats.unread })
              : t('stats.conversationsHint')
          }
        />
        <ContactMetricCard
          icon={Briefcase}
          label={t('stats.activeDeals')}
          value={pageStats.activeDeals.toLocaleString()}
          hint={formatCurrencyShort(pageStats.activeDealValue, defaultCurrency)}
        />
      </section>

      <section className="border-border bg-card overflow-hidden rounded-lg border">
        <div className="p-4">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-foreground text-sm font-semibold">
                Base de clientes
              </h2>
              <p className="text-muted-foreground text-xs">
                Consulte, segmente e abra a ficha 360 de cada cliente.
              </p>
            </div>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="text-muted-foreground hover:text-foreground self-start sm:self-auto"
              >
                <X className="size-3.5" />
                {t('clearAllFilters')}
              </Button>
            )}
          </div>
          <div className="bg-muted/60 flex gap-1 overflow-x-auto rounded-md p-1">
            {CONTACT_SEGMENTS.map((item) => {
              const Icon = item.icon;
              const active = segment === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => selectSegment(item.key)}
                  className={cn(
                    'inline-flex min-w-max items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                  )}
                >
                  <Icon className="size-3.5" />
                  {t(`segments.${item.key}`)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search + tag filter */}
        <div className="border-border bg-muted/20 space-y-3 border-t p-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
              <div className="relative w-full max-w-lg">
                <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    // Reset pagination when the query changes — the result
                    // set shrinks/grows, page N may no longer be valid.
                    setPage(0);
                  }}
                  placeholder={t('searchPlaceholder')}
                  className="bg-card border-border text-foreground placeholder:text-muted-foreground pl-8"
                />
              </div>

              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      className="border-border text-muted-foreground hover:bg-muted shrink-0"
                    />
                  }
                >
                  <Filter className="size-4" />
                  {t('filterByTags')}
                  {selectedTagIds.length > 0 && (
                    <span className="bg-primary text-primary-foreground ml-1 inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-semibold">
                      {selectedTagIds.length}
                    </span>
                  )}
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 p-0">
                  <div className="border-border flex items-center justify-between border-b px-3 py-2">
                    <span className="text-popover-foreground text-sm font-medium">
                      {t('filterByTags')}
                    </span>
                    {selectedTagIds.length > 0 && (
                      <button
                        onClick={clearTagFilters}
                        className="text-muted-foreground hover:text-foreground text-xs"
                      >
                        {t('clearAll')}
                      </button>
                    )}
                  </div>
                  {allTags.length === 0 ? (
                    <p className="text-muted-foreground px-3 py-4 text-center text-sm">
                      {t('noTagsYet')}
                    </p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto py-1">
                      {allTags.map((tag) => (
                        <label
                          key={tag.id}
                          className="hover:bg-muted/50 flex cursor-pointer items-center gap-2.5 px-3 py-1.5"
                        >
                          <Checkbox
                            checked={selectedTagIds.includes(tag.id)}
                            onCheckedChange={() => toggleTagFilter(tag.id)}
                            aria-label={`Filter by ${tag.name}`}
                          />
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          <span className="text-popover-foreground truncate text-sm">
                            {tag.name}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      className="border-border text-muted-foreground hover:bg-muted shrink-0"
                    />
                  }
                >
                  <Bookmark className="size-4" />
                  {t('savedSegments.filter')}
                  {selectedSavedSegmentId && (
                    <span className="bg-primary text-primary-foreground ml-1 inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-semibold">
                      1
                    </span>
                  )}
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-0">
                  <div className="border-border flex items-center justify-between border-b px-3 py-2">
                    <span className="text-popover-foreground text-sm font-medium">
                      {t('savedSegments.title')}
                    </span>
                    {selectedSavedSegmentId && (
                      <button
                        onClick={() => applySavedSegment('')}
                        className="text-muted-foreground hover:text-foreground text-xs"
                      >
                        {t('clearAll')}
                      </button>
                    )}
                  </div>
                  {savedSegments.length === 0 ? (
                    <p className="text-muted-foreground px-3 py-4 text-center text-sm">
                      {t('savedSegments.empty')}
                    </p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto py-1">
                      {savedSegments.map((item) => {
                        const active = selectedSavedSegmentId === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() =>
                              applySavedSegment(active ? '' : item.id)
                            }
                            className={cn(
                              'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                              active
                                ? 'bg-primary/10 text-primary'
                                : 'text-popover-foreground hover:bg-muted/60'
                            )}
                          >
                            <Bookmark className="size-3.5 shrink-0" />
                            <span className="truncate">{item.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-muted-foreground px-1 text-xs">
                {contacts.length} nesta página
              </span>
              {contacts.length > 0 && (
                <Button variant="ghost" size="sm" onClick={toggleSelectAll}>
                  <Check className="size-3.5" />
                  {allOnPageSelected ? 'Limpar página' : 'Selecionar página'}
                </Button>
              )}
            </div>
          </div>

          {/* Active tag-filter chips */}
          {selectedTagIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {selectedTagIds.map((id) => {
                const tag = tagsMap[id];
                if (!tag) return null;
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      backgroundColor: tag.color + '20',
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                    <button
                      onClick={() => toggleTagFilter(id)}
                      aria-label={`Remove ${tag.name} filter`}
                      className="hover:opacity-70"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                );
              })}
              <button
                onClick={clearTagFilters}
                className="text-muted-foreground hover:text-foreground px-1 text-xs"
              >
                {t('clearAll')}
              </button>
            </div>
          )}

          {selectedSavedSegmentId && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="border-primary/25 bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium">
                <Bookmark className="size-3" />
                {savedSegments.find((item) => item.id === selectedSavedSegmentId)
                  ?.name ?? t('savedSegments.filter')}
                <button
                  onClick={() => applySavedSegment('')}
                  aria-label={t('savedSegments.clear')}
                  className="hover:opacity-70"
                >
                  <X className="size-3" />
                </button>
              </span>
            </div>
          )}
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="border-border bg-primary-soft/40 flex items-center justify-between gap-4 border-t px-4 py-2.5">
            <p className="text-foreground text-sm">
              {t('selectedCount', { count: selected.size })}
            </p>
            <div className="flex items-center gap-2">
              {allOnPageSelected &&
                !allResultsSelected &&
                totalCount > contacts.length && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllResults}
                    disabled={selectingAll}
                  >
                    {selectingAll ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                    Selecionar todos os {totalCount}
                  </Button>
                )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
                className="text-muted-foreground hover:text-foreground"
              >
                {t('clearSelection')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportContacts('selected')}
                disabled={exporting}
              >
                {exporting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FileDown className="size-3.5" />
                )}
                Exportar seleção
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={openMergeDialog}
                disabled={!canMergeSelectedContacts || !canEdit}
                title={
                  canMergeSelectedContacts
                    ? 'Unir os dois clientes selecionados'
                    : 'Selecione exatamente dois clientes nesta pagina'
                }
              >
                <GitMerge className="size-4" />
                Unir clientes
              </Button>
              <GatedButton
                variant="destructive"
                size="sm"
                canAct={canEdit}
                gateReason="delete clients"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="size-4" />
                {t('deleteSelected')}
              </GatedButton>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="border-border overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-14 px-3 text-center">
                  <Checkbox
                    className="size-5 rounded-md border-2"
                    checked={allOnPageSelected}
                    indeterminate={!allOnPageSelected && someOnPageSelected}
                    onCheckedChange={toggleSelectAll}
                    disabled={contacts.length === 0}
                    aria-label="Select all clients on this page"
                  />
                </TableHead>
                <TableHead className="text-muted-foreground">
                  {t('tableColumns.profile')}
                </TableHead>
                <TableHead className="text-muted-foreground">
                  Ref. cliente
                </TableHead>
                <TableHead className="text-muted-foreground hidden md:table-cell">
                  {t('tableColumns.quality')}
                </TableHead>
                <TableHead className="text-muted-foreground hidden xl:table-cell">
                  {t('tableColumns.relationship')}
                </TableHead>
                <TableHead className="text-muted-foreground hidden md:table-cell">
                  {t('tableColumns.tags')}
                </TableHead>
                <TableHead className="text-muted-foreground hidden lg:table-cell">
                  {t('tableColumns.createdAt')}
                </TableHead>
                <TableHead className="text-muted-foreground w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow className="border-border">
                  <TableCell colSpan={8} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="text-primary size-6 animate-spin" />
                      <p className="text-muted-foreground text-sm">
                        {t('loading')}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : contacts.length === 0 ? (
                <TableRow className="border-border">
                  <TableCell colSpan={8} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Users className="text-muted-foreground size-8" />
                      <p className="text-muted-foreground text-sm">
                        {hasActiveFilters
                          ? t('noContactsMatch')
                          : t('noContactsYet')}
                      </p>
                      {!hasActiveFilters && (
                        <GatedButton
                          canAct={canEdit}
                          gateReason="add or import clients"
                          variant="outline"
                          size="sm"
                          onClick={openAddForm}
                          className="border-border text-muted-foreground hover:bg-muted mt-2"
                        >
                          <Plus className="size-3.5" />
                          {t('addFirstContact')}
                        </GatedButton>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                contacts.map((contact) => {
                  const insight = contactInsights[contact.id] ?? EMPTY_INSIGHT;
                  const portalAccess = portalAccessByContact[contact.id];
                  const missingFields = getMissingContactFields(contact);
                  const score = getContactScore(contact);

                  return (
                    <TableRow
                      key={contact.id}
                      className="border-border hover:bg-muted/50 cursor-pointer"
                      onClick={() => openClient360(contact.id)}
                    >
                      <TableCell
                        className="w-14 px-3 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          className="size-5 rounded-md border-2"
                          checked={selected.has(contact.id)}
                          onCheckedChange={() => toggleSelect(contact.id)}
                          aria-label={`Select ${contact.name || contact.phone}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="bg-primary-soft text-primary flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                            {getContactInitials(contact)}
                          </div>
                          <div className="min-w-0 space-y-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="text-foreground truncate font-medium">
                                {contact.name || (
                                  <span className="text-muted-foreground italic">
                                    {t('unnamed')}
                                  </span>
                                )}
                              </span>
                              {insight.unreadCount > 0 && (
                                <Badge
                                  variant="outline"
                                  className="border-primary/30 bg-primary-soft text-primary h-5"
                                >
                                  {t('unreadBadge', {
                                    count: insight.unreadCount,
                                  })}
                                </Badge>
                              )}
                            </div>
                            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                              <button
                                type="button"
                                onClick={(event) => copyPhone(contact, event)}
                                className="hover:text-primary inline-flex items-center gap-1 font-mono transition-colors"
                                aria-label={t('copyPhone')}
                              >
                                <Phone className="size-3" />
                                {contact.phone}
                                {copiedPhoneId === contact.id ? (
                                  <Check className="text-primary size-3" />
                                ) : (
                                  <Copy className="size-3" />
                                )}
                              </button>
                              {contact.email && (
                                <span className="inline-flex min-w-0 items-center gap-1">
                                  <Mail className="size-3 shrink-0" />
                                  <span className="truncate">
                                    {contact.email}
                                  </span>
                                </span>
                              )}
                              {contact.company && (
                                <span className="inline-flex min-w-0 items-center gap-1">
                                  <Building2 className="size-3 shrink-0" />
                                  <span className="truncate">
                                    {contact.company}
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1.5">
                          <span className="bg-muted text-foreground inline-flex min-w-20 justify-center rounded-md px-2 py-1 font-mono text-xs font-medium">
                            {contact.client_reference || 'Sem ref.'}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              'h-5 text-[10px]',
                              portalAccess
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                : 'border-muted-foreground/20 text-muted-foreground'
                            )}
                          >
                            {portalAccess
                              ? portalAccess.last_login_at
                                ? 'Portal ativo'
                                : 'Portal criado'
                              : 'Sem Portal'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="min-w-36 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground text-xs">
                              {t('qualityScore')}
                            </span>
                            <span className="text-foreground text-xs font-semibold">
                              {score}%
                            </span>
                          </div>
                          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                score >= 80
                                  ? 'bg-primary'
                                  : score >= 50
                                    ? 'bg-amber-500'
                                    : 'bg-destructive'
                              )}
                              style={{ width: `${score}%` }}
                            />
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {missingFields.length === 0 ? (
                              <Badge
                                variant="outline"
                                className="border-primary/30 bg-primary-soft text-primary h-5"
                              >
                                {t('completeBadge')}
                              </Badge>
                            ) : (
                              missingFields.slice(0, 2).map((field) => (
                                <Badge
                                  key={field}
                                  variant="outline"
                                  className="h-5 text-[10px]"
                                >
                                  {t(`missingFields.${field}`)}
                                </Badge>
                              ))
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <div className="text-muted-foreground min-w-52 space-y-1 text-xs">
                          <div className="flex items-center gap-1.5">
                            <MessageCircle className="text-primary size-3.5" />
                            {insight.lastConversationId ? (
                              <span>
                                {t('lastConversation', {
                                  time: formatRelativeContactDate(
                                    insight.lastMessageAt
                                  ),
                                })}
                              </span>
                            ) : (
                              <span>{t('noConversation')}</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            <span className="inline-flex items-center gap-1">
                              <Briefcase className="size-3.5" />
                              {t('activeDealsSummary', {
                                count: insight.activeDealCount,
                                value: formatCurrencyShort(
                                  insight.activeDealValue,
                                  defaultCurrency
                                ),
                              })}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <StickyNote className="size-3.5" />
                              {t('notesSummary', { count: insight.notesCount })}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays className="size-3.5" />
                              {insight.appointmentCount} marcações ·{' '}
                              {insight.upcomingAppointmentCount} próximas
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <BadgeEuro className="size-3.5" />
                              {formatCurrencyShort(
                                insight.totalPaid,
                                defaultCurrency
                              )}{' '}
                              recebido
                              {insight.balanceDue > 0
                                ? ` · ${formatCurrencyShort(insight.balanceDue, defaultCurrency)} pendente`
                                : ''}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            <span className="inline-flex items-center gap-1">
                              <Gift className="size-3.5" />
                              {insight.activeVoucherCount} vouchers
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <PackageCheck className="size-3.5" />
                              {insight.activePackCount} packs
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {contact.tags && contact.tags.length > 0 ? (
                            contact.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag.id}
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                                style={{
                                  backgroundColor: tag.color + '20',
                                  color: tag.color,
                                }}
                              >
                                {tag.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              -
                            </span>
                          )}
                          {contact.tags && contact.tags.length > 3 && (
                            <span className="text-muted-foreground text-[10px]">
                              +{contact.tags.length - 3}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden text-xs lg:table-cell">
                        {formatContactDate(contact.created_at)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={(event) =>
                              openInboxForContact(contact, event)
                            }
                            className="text-muted-foreground hover:text-primary"
                            aria-label={t('openInbox')}
                          >
                            <MessageCircle className="size-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              }
                            >
                              <MoreHorizontal className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="bg-popover border-border"
                            >
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openClient360(contact.id);
                                }}
                                className="text-popover-foreground focus:bg-muted focus:text-foreground"
                              >
                                <UserRoundCheck className="size-4" />
                                Ver Cliente 360
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditClient(contact.id);
                                }}
                                className="text-popover-foreground focus:bg-muted focus:text-foreground"
                              >
                                <Pencil className="size-4" />
                                {t('editAction')}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-border" />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  confirmDelete(contact);
                                }}
                              >
                                <Trash2 className="size-4" />
                                {t('deleteAction')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs">
            {t('showingPagination', {
              start: page * PAGE_SIZE + 1,
              end: Math.min((page + 1) * PAGE_SIZE, totalCount),
              total: totalCount,
            })}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasPrev}
              onClick={() => setPage((p) => p - 1)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-muted-foreground px-2 text-xs">
              {t('pageCount', { page: page + 1, total: totalPages })}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Contact Form Dialog */}
      <ContactForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={() => {
          fetchContacts();
          fetchTags();
        }}
        onViewExisting={(id) => {
          setFormOpen(false);
          openClient360(id);
        }}
      />

      {/* Import Modal */}
      <ImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={fetchContacts}
      />

      {/* Custom Fields Manager (admin+) */}
      {canEditSettings && (
        <CustomFieldsManager
          open={customFieldsOpen}
          onOpenChange={setCustomFieldsOpen}
        />
      )}

      {/* Delete Confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              {t('deleteContactTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('deleteContactDesc', {
                name: deleteTarget?.name || deleteTarget?.phone || '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              {t('deleteBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={mergeOpen}
        onOpenChange={(open) => {
          if (!merging) setMergeOpen(open);
        }}
      >
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="text-primary size-5" />
              Unir clientes duplicados
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              A primeira Ref. cliente sera mantida como o registo principal. Todo o historico do outro cliente sera transferido para ele.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {selectedContacts.map((contact) => {
              const isTarget = contact.id === mergeTargetId;
              return (
                <div
                  key={contact.id}
                  className={cn(
                    'rounded-lg border p-3',
                    isTarget
                      ? 'border-primary bg-primary-soft/40'
                      : 'border-border bg-muted/30'
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {contact.name || contact.phone || 'Cliente sem nome'}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Ref. {contact.client_reference || 'sem referencia'}
                        {contact.phone ? ` - ${contact.phone}` : ''}
                      </p>
                    </div>
                    <Badge variant={isTarget ? 'default' : 'outline'}>
                      {isTarget ? 'Registo a manter' : 'Sera unido'}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setMergeOpen(false)}
              disabled={merging}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleMergeContacts()}
              disabled={!canMergeSelectedContacts || !mergeTargetId || merging}
            >
              {merging ? <Loader2 className="size-4 animate-spin" /> : <GitMerge className="size-4" />}
              Confirmar uniao
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              {t('deleteBulkTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('deleteBulkDesc', { count: selected.size })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setBulkDeleteOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              {t('deleteBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContactMetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="border-border min-w-0 border-b p-4 last:border-b-0 sm:odd:border-r xl:border-r xl:border-b-0 xl:last:border-r-0 sm:[&:nth-last-child(-n+2)]:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium">{label}</p>
          <p className="text-foreground mt-1.5 text-xl leading-none font-semibold">
            {value}
          </p>
          <p className="text-muted-foreground mt-1.5 truncate text-[11px]">
            {hint}
          </p>
        </div>
        <span className="bg-primary-soft text-primary flex size-8 shrink-0 items-center justify-center rounded-md">
          <Icon className="size-4" />
        </span>
      </div>
    </div>
  );
}

function isContactComplete(contact: ContactWithTags) {
  return (
    Boolean(contact.name?.trim()) &&
    Boolean(contact.email?.trim()) &&
    Boolean(contact.company?.trim()) &&
    Boolean(contact.phone?.trim()) &&
    Boolean(contact.tags?.length)
  );
}

function getMissingContactFields(contact: ContactWithTags) {
  const fields: Array<'name' | 'email' | 'company' | 'tags'> = [];
  if (!contact.name?.trim()) fields.push('name');
  if (!contact.email?.trim()) fields.push('email');
  if (!contact.company?.trim()) fields.push('company');
  if (!contact.tags?.length) fields.push('tags');
  return fields;
}

function getContactScore(contact: ContactWithTags) {
  const checks = [
    Boolean(contact.name?.trim()),
    Boolean(contact.phone?.trim()),
    Boolean(contact.email?.trim()),
    Boolean(contact.company?.trim()),
    Boolean(contact.tags?.length),
  ];
  const passed = checks.filter(Boolean).length;
  return Math.round((passed / checks.length) * 100);
}

function getContactInitials(contact: Contact) {
  const label =
    contact.name?.trim() || contact.company?.trim() || contact.phone;
  if (!label) return '?';
  const words = label
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function formatContactDate(value: string) {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatRelativeContactDate(value: string | null) {
  if (!value) return '-';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '-';
  const diffSeconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSeconds < 60) return 'agora';
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days} dia${days > 1 ? 's' : ''}`;
  return formatContactDate(value);
}
