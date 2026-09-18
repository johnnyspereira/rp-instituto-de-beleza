'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  CONVERSATION_SELECT,
  isInternalAlertConversation,
  matchesContactFilters,
  normalizeConversations,
} from '@/lib/inbox/conversations';
import { cn } from '@/lib/utils';
import type {
  Conversation,
  ConversationStatus,
  PipelineStage,
  Profile,
  SenderType,
  Tag,
} from '@/types';
import {
  Bot,
  Briefcase,
  CalendarClock,
  ChevronDown,
  GitBranch,
  MessageCircleReply,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversation: Conversation) => void;
  conversations: Conversation[];
  onConversationsLoaded: (conversations: Conversation[]) => void;
  /**
   * Increment to force the fetch effect below to refire. The parent
   * bumps this on realtime reconnect / tab visibility -> visible so the
   * list catches up on any events sent while the WS was disconnected
   * or the tab was throttled. Optional so existing callers keep working.
   */
  resyncToken?: number;
}

interface ConversationDealSummary {
  id: string;
  contact_id: string | null;
  conversation_id?: string | null;
  status?: string | null;
  stage_id?: string | null;
  pipeline_id?: string | null;
}

interface MessageSenderSummary {
  conversation_id: string;
  sender_type: SenderType;
  created_at: string;
}

interface ContactAppointmentSummary {
  id: string;
  contact_id: string | null;
  scheduled_start: string;
  status: string;
}

const STATUS_COLORS: Record<ConversationStatus, string> = {
  open: 'bg-primary',
  pending: 'bg-amber-500',
  closed: 'bg-muted-foreground',
};

type InboxFilter = ConversationStatus | 'all' | 'unread';
type CrmFilter = 'all' | 'needsReply' | 'withoutDeal' | 'automationActive';
type WorkQueue = 'all' | 'new' | 'active' | 'waiting' | 'resolved';

const CRM_FILTER_OPTIONS: { label: string; value: CrmFilter }[] = [
  { label: 'All CRM', value: 'all' },
  { label: 'Needs reply', value: 'needsReply' },
  { label: 'No deal', value: 'withoutDeal' },
  { label: 'Automation', value: 'automationActive' },
];

export function ConversationList({
  activeConversationId,
  onSelect,
  conversations,
  onConversationsLoaded,
  resyncToken = 0,
}: ConversationListProps) {
  const t = useTranslations('Inbox.conversationList');

  const FILTER_OPTIONS: { label: string; value: InboxFilter }[] = useMemo(
    () => [
      { label: t('filterAll'), value: 'all' },
      { label: t('filterUnread'), value: 'unread' },
      { label: t('filterOpen'), value: 'open' },
      { label: t('filterPending'), value: 'pending' },
      { label: t('filterClosed'), value: 'closed' },
    ],
    [t]
  );

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [workQueue, setWorkQueue] = useState<WorkQueue>('all');
  const [crmFilter, setCrmFilter] = useState<CrmFilter>('all');
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>('all');
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string>('all');
  const [conversationDeals, setConversationDeals] = useState<
    ConversationDealSummary[]
  >([]);
  const [contactAppointments, setContactAppointments] = useState<
    ContactAppointmentSummary[]
  >([]);
  const [lastSenderByConversation, setLastSenderByConversation] = useState<
    Record<string, SenderType>
  >({});

  // Keep the latest callback in a ref so the fetch effect below can
  // have a stable identity. Mutation lives in an effect (not render) per
  // React 19's refs rule.
  const onConversationsLoadedRef = useRef(onConversationsLoaded);
  useEffect(() => {
    onConversationsLoadedRef.current = onConversationsLoaded;
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select(CONVERSATION_SELECT)
        .order('last_message_at', { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error('Failed to fetch conversations:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        setLoading(false);
        return;
      }

      onConversationsLoadedRef.current(
        normalizeConversations(data ?? []).filter(
          (conversation) => !isInternalAlertConversation(conversation)
        )
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [resyncToken]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const [tagsRes, profilesRes, stagesRes] = await Promise.all([
        supabase.from('tags').select('*').order('name'),
        supabase.from('profiles').select('*').order('full_name'),
        supabase
          .from('pipeline_stages')
          .select('*')
          .order('position', { ascending: true }),
      ]);
      if (cancelled) return;
      setTags((tagsRes.data as Tag[] | null) ?? []);
      setProfiles((profilesRes.data as Profile[] | null) ?? []);
      setStages((stagesRes.data as PipelineStage[] | null) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const contactIds = Array.from(
      new Set(conversations.map((c) => c.contact_id).filter(Boolean))
    );
    const conversationIds = conversations.map((c) => c.id);
    if (contactIds.length === 0 || conversationIds.length === 0) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setConversationDeals([]);
      setContactAppointments([]);
      setLastSenderByConversation({});
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }

    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const [dealsRes, messagesRes, appointmentsRes] = await Promise.all([
        supabase
          .from('deals')
          .select(
            'id, contact_id, conversation_id, status, stage_id, pipeline_id'
          )
          .in('contact_id', contactIds),
        supabase
          .from('messages')
          .select('conversation_id, sender_type, created_at')
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: false })
          .limit(Math.min(conversationIds.length * 8, 500)),
        supabase
          .from('clinic_appointments')
          .select('id, contact_id, scheduled_start, status')
          .in('contact_id', contactIds)
          .gte('scheduled_start', new Date().toISOString())
          .neq('status', 'cancelled')
          .order('scheduled_start', { ascending: true })
          .limit(Math.min(contactIds.length * 3, 300)),
      ]);

      if (cancelled) return;

      setConversationDeals(
        (dealsRes.data as ConversationDealSummary[] | null) ?? []
      );
      setContactAppointments(
        appointmentsRes.error
          ? []
          : ((appointmentsRes.data as ContactAppointmentSummary[] | null) ?? [])
      );

      const latest: Record<string, SenderType> = {};
      for (const row of (messagesRes.data as MessageSenderSummary[] | null) ??
        []) {
        if (latest[row.conversation_id]) continue;
        latest[row.conversation_id] = row.sender_type;
      }
      setLastSenderByConversation(latest);
    })();

    return () => {
      cancelled = true;
    };
  }, [conversations]);

  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) {
      const co = c.contact?.company?.trim();
      if (co) set.add(co);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [conversations]);

  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const tag of tags) m.set(tag.id, tag);
    return m;
  }, [tags]);

  const stagesById = useMemo(() => {
    const m = new Map<string, PipelineStage>();
    for (const stage of stages) m.set(stage.id, stage);
    return m;
  }, [stages]);

  const dealsByContactId = useMemo(() => {
    const map = new Map<string, ConversationDealSummary[]>();
    for (const deal of conversationDeals) {
      if (!deal.contact_id) continue;
      const list = map.get(deal.contact_id) ?? [];
      list.push(deal);
      map.set(deal.contact_id, list);
    }
    return map;
  }, [conversationDeals]);

  const appointmentsByContactId = useMemo(() => {
    const map = new Map<string, ContactAppointmentSummary[]>();
    for (const appointment of contactAppointments) {
      if (!appointment.contact_id) continue;
      const list = map.get(appointment.contact_id) ?? [];
      list.push(appointment);
      map.set(appointment.contact_id, list);
    }
    return map;
  }, [contactAppointments]);

  const filtered = useMemo(() => {
    let result = conversations;

    if (workQueue === 'new') {
      result = result.filter((c) => c.status === 'open' && !c.assigned_agent_id);
    } else if (workQueue === 'active') {
      result = result.filter((c) => c.status === 'open' && Boolean(c.assigned_agent_id));
    } else if (workQueue === 'waiting') {
      result = result.filter((c) => c.status === 'pending');
    } else if (workQueue === 'resolved') {
      result = result.filter((c) => c.status === 'closed');
    }

    if (filter === 'unread') {
      result = result.filter((c) => c.unread_count > 0);
    } else if (filter !== 'all') {
      result = result.filter((c) => c.status === filter);
    }

    if (selectedAssigneeId !== 'all') {
      result = result.filter((c) =>
        selectedAssigneeId === 'unassigned'
          ? !c.assigned_agent_id
          : c.assigned_agent_id === selectedAssigneeId
      );
    }

    if (selectedStageId !== 'all') {
      result = result.filter((c) =>
        (dealsByContactId.get(c.contact_id) ?? []).some(
          (deal) => deal.stage_id === selectedStageId
        )
      );
    }

    if (crmFilter === 'needsReply') {
      result = result.filter(
        (c) =>
          c.unread_count > 0 || lastSenderByConversation[c.id] === 'customer'
      );
    } else if (crmFilter === 'withoutDeal') {
      result = result.filter(
        (c) => (dealsByContactId.get(c.contact_id) ?? []).length === 0
      );
    } else if (crmFilter === 'automationActive') {
      result = result.filter(
        (c) => (c.ai_reply_count ?? 0) > 0 && !c.ai_autoreply_disabled
      );
    }

    if (selectedTagIds.length > 0 || selectedCompany !== null) {
      result = result.filter((c) =>
        matchesContactFilters(c, {
          tagIds: selectedTagIds,
          company: selectedCompany,
        })
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const name = c.contact?.name?.toLowerCase() ?? '';
        const reference = c.contact?.client_reference?.toLowerCase() ?? '';
        const phone = c.contact?.phone?.toLowerCase() ?? '';
        const company = c.contact?.company?.toLowerCase() ?? '';
        const lastMsg = c.last_message_text?.toLowerCase() ?? '';
        return (
          name.includes(q) ||
          reference.includes(q) ||
          phone.includes(q) ||
          company.includes(q) ||
          lastMsg.includes(q)
        );
      });
    }

    return result;
  }, [
    conversations,
    crmFilter,
    dealsByContactId,
    filter,
    lastSenderByConversation,
    search,
    selectedAssigneeId,
    selectedCompany,
    selectedStageId,
    selectedTagIds,
    workQueue,
  ]);

  const queueCounts = useMemo(() => ({
    new: conversations.filter((c) => c.status === 'open' && !c.assigned_agent_id).length,
    active: conversations.filter((c) => c.status === 'open' && Boolean(c.assigned_agent_id)).length,
    waiting: conversations.filter((c) => c.status === 'pending').length,
    resolved: conversations.filter((c) => c.status === 'closed').length,
  }), [conversations]);

  const selectWorkQueue = useCallback((queue: WorkQueue) => {
    setWorkQueue(queue);
    setFilter('all');
  }, []);

  const toggleTag = useCallback((id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }, []);

  const clearContactFilters = useCallback(() => {
    setSelectedTagIds([]);
    setSelectedCompany(null);
    setSelectedAssigneeId('all');
    setSelectedStageId('all');
    setCrmFilter('all');
  }, []);

  const hasAdvancedFilters =
    selectedTagIds.length > 0 ||
    selectedCompany !== null ||
    selectedAssigneeId !== 'all' ||
    selectedStageId !== 'all' ||
    crmFilter !== 'all';

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    []
  );

  const handleSelect = useCallback(
    (conv: Conversation) => {
      onSelect(conv);
    },
    [onSelect]
  );

  const activeFilter = FILTER_OPTIONS.find((o) => o.value === filter);
  const activeCrmFilter = CRM_FILTER_OPTIONS.find((o) => o.value === crmFilter);
  const activeAssignee =
    selectedAssigneeId === 'unassigned'
      ? 'Unassigned'
      : profiles.find((p) => p.user_id === selectedAssigneeId)?.full_name;
  const activeStage = stagesById.get(selectedStageId)?.name;
  const unreadTotal = conversations.filter(
    (conversation) => conversation.unread_count > 0
  ).length;

  return (
    <div className="bg-card flex h-full w-full flex-col lg:w-[21rem]">
      <div className="border-border/70 space-y-3 border-b p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.16em] text-primary uppercase">Fila de trabalho</p>
            <h2 className="mt-1 text-sm font-semibold text-foreground">Conversas</h2>
          </div>
          <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-[10px] font-bold">{conversations.length}</span>
        </div>
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={handleSearchChange}
            placeholder={t('searchPlaceholder')}
            className="border-border/70 bg-muted/60 text-foreground placeholder-muted-foreground focus:border-primary/50 h-10 rounded-xl pl-9 text-sm shadow-inner"
          />
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1 text-[11px] font-medium">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={cn(
              'rounded-lg px-2 py-1.5 transition-colors',
              filter === 'all'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Todas
          </button>
          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={cn(
              'rounded-lg px-2 py-1.5 transition-colors',
              filter === 'unread'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Não lidas{unreadTotal > 0 ? ` (${unreadTotal})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setCrmFilter('needsReply')}
            className={cn(
              'rounded-lg px-2 py-1.5 transition-colors',
              crmFilter === 'needsReply'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Responder
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-7 items-center justify-center gap-1 rounded-md px-2 text-xs">
              {activeFilter?.label ?? t('filterAll')}
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="border-border bg-popover"
            >
              {FILTER_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={cn(
                    'text-sm',
                    filter === opt.value
                      ? 'text-primary'
                      : 'text-popover-foreground'
                  )}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                'hover:bg-muted inline-flex h-7 items-center justify-center gap-1 rounded-md px-2 text-xs',
                crmFilter !== 'all'
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <MessageCircleReply className="h-3 w-3" />
              <span>{activeCrmFilter?.label ?? 'CRM'}</span>
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="border-border bg-popover"
            >
              {CRM_FILTER_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => setCrmFilter(option.value)}
                  className={cn(
                    'text-sm',
                    crmFilter === option.value
                      ? 'text-primary'
                      : 'text-popover-foreground'
                  )}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                'hover:bg-muted inline-flex h-7 max-w-36 items-center justify-center gap-1 rounded-md px-2 text-xs',
                selectedAssigneeId !== 'all'
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <UserRound className="h-3 w-3" />
              <span className="truncate">{activeAssignee ?? 'Owner'}</span>
              <ChevronDown className="h-3 w-3 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="border-border bg-popover max-h-64 w-56"
            >
              <DropdownMenuItem
                onClick={() => setSelectedAssigneeId('all')}
                className={cn(
                  'text-sm',
                  selectedAssigneeId === 'all'
                    ? 'text-primary'
                    : 'text-popover-foreground'
                )}
              >
                All owners
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSelectedAssigneeId('unassigned')}
                className={cn(
                  'text-sm',
                  selectedAssigneeId === 'unassigned'
                    ? 'text-primary'
                    : 'text-popover-foreground'
                )}
              >
                Unassigned
              </DropdownMenuItem>
              {profiles.map((profile) => (
                <DropdownMenuItem
                  key={profile.id}
                  onClick={() => setSelectedAssigneeId(profile.user_id)}
                  className={cn(
                    'text-sm',
                    selectedAssigneeId === profile.user_id
                      ? 'text-primary'
                      : 'text-popover-foreground'
                  )}
                >
                  <span className="truncate">{profile.full_name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {stages.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  'hover:bg-muted inline-flex h-7 max-w-36 items-center justify-center gap-1 rounded-md px-2 text-xs',
                  selectedStageId !== 'all'
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <GitBranch className="h-3 w-3" />
                <span className="truncate">{activeStage ?? 'Stage'}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="border-border bg-popover max-h-64 w-56"
              >
                <DropdownMenuItem
                  onClick={() => setSelectedStageId('all')}
                  className={cn(
                    'text-sm',
                    selectedStageId === 'all'
                      ? 'text-primary'
                      : 'text-popover-foreground'
                  )}
                >
                  All stages
                </DropdownMenuItem>
                {stages.map((stage) => (
                  <DropdownMenuItem
                    key={stage.id}
                    onClick={() => setSelectedStageId(stage.id)}
                    className={cn(
                      'text-sm',
                      selectedStageId === stage.id
                        ? 'text-primary'
                        : 'text-popover-foreground'
                    )}
                  >
                    <span
                      className="mr-2 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: stage.color }}
                    />
                    <span className="truncate">{stage.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {tags.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  'hover:bg-muted inline-flex h-7 items-center justify-center gap-1 rounded-md px-2 text-xs',
                  selectedTagIds.length > 0
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t('tags')}
                {selectedTagIds.length > 0 && (
                  <span className="bg-primary text-primary-foreground flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold">
                    {selectedTagIds.length}
                  </span>
                )}
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="border-border bg-popover max-h-64 w-56"
              >
                {tags.map((tag) => (
                  <DropdownMenuCheckboxItem
                    key={tag.id}
                    checked={selectedTagIds.includes(tag.id)}
                    onCheckedChange={() => toggleTag(tag.id)}
                    className="text-popover-foreground text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="truncate">{tag.name}</span>
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {companies.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  'hover:bg-muted inline-flex h-7 max-w-40 items-center justify-center gap-1 rounded-md px-2 text-xs',
                  selectedCompany
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span className="truncate">
                  {selectedCompany ?? t('company')}
                </span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="border-border bg-popover max-h-64 w-56"
              >
                <DropdownMenuItem
                  onClick={() => setSelectedCompany(null)}
                  className={cn(
                    'text-sm',
                    selectedCompany === null
                      ? 'text-primary'
                      : 'text-popover-foreground'
                  )}
                >
                  {t('allCompanies')}
                </DropdownMenuItem>
                {companies.map((co) => (
                  <DropdownMenuItem
                    key={co}
                    onClick={() => setSelectedCompany(co)}
                    className={cn(
                      'text-sm',
                      selectedCompany === co
                        ? 'text-primary'
                        : 'text-popover-foreground'
                    )}
                  >
                    <span className="truncate">{co}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {hasAdvancedFilters && (
          <div className="flex flex-wrap items-center gap-1">
            {crmFilter !== 'all' && (
              <FilterChip
                label={activeCrmFilter?.label ?? 'CRM'}
                onClear={() => setCrmFilter('all')}
              />
            )}
            {selectedAssigneeId !== 'all' && (
              <FilterChip
                label={activeAssignee ?? 'Owner'}
                onClear={() => setSelectedAssigneeId('all')}
              />
            )}
            {selectedStageId !== 'all' && (
              <FilterChip
                label={activeStage ?? 'Stage'}
                onClear={() => setSelectedStageId('all')}
              />
            )}
            {selectedTagIds.map((id) => {
              const tag = tagsById.get(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleTag(id)}
                  className="bg-muted text-foreground hover:bg-muted/70 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: tag?.color ?? 'var(--muted-foreground)',
                    }}
                  />
                  <span className="max-w-24 truncate">
                    {tag?.name ?? t('tags')}
                  </span>
                  <X className="h-3 w-3" />
                </button>
              );
            })}
            {selectedCompany && (
              <FilterChip
                label={selectedCompany}
                onClear={() => setSelectedCompany(null)}
              />
            )}
            <button
              onClick={clearContactFilters}
              className="text-muted-foreground hover:text-foreground px-1 text-[11px]"
            >
              {t('clearAll')}
            </button>
          </div>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1 p-1.5">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-muted-foreground text-sm">
              {t('noConversations')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map((conv) => {
              const dealSummaries = dealsByContactId.get(conv.contact_id) ?? [];
              const appointmentSummaries =
                appointmentsByContactId.get(conv.contact_id) ?? [];
              return (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === activeConversationId}
                  onSelect={handleSelect}
                  t={t}
                  dealCount={dealSummaries.length}
                  appointmentCount={appointmentSummaries.length}
                  dealStages={dealSummaries
                    .map((deal) =>
                      deal.stage_id ? stagesById.get(deal.stage_id) : null
                    )
                    .filter((stage): stage is PipelineStage => Boolean(stage))}
                  lastSender={lastSenderByConversation[conv.id]}
                />
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (conversation: Conversation) => void;
  t: ReturnType<typeof useTranslations>;
  dealCount: number;
  appointmentCount: number;
  dealStages: PipelineStage[];
  lastSender?: SenderType;
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  t,
  dealCount,
  appointmentCount,
  dealStages,
  lastSender,
}: ConversationItemProps) {
  const contact = conversation.contact;
  const displayName = contact?.name || contact?.phone || t('unknown');
  const initials = displayName.charAt(0).toUpperCase();
  const tags = contact?.tags?.slice(0, 2) ?? [];
  const needsReply = conversation.unread_count > 0 || lastSender === 'customer';
  const automationActive =
    (conversation.ai_reply_count ?? 0) > 0 &&
    !conversation.ai_autoreply_disabled;
  const firstStage = dealStages[0];

  const handleClick = useCallback(() => {
    onSelect(conversation);
  }, [onSelect, conversation]);

  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), {
        addSuffix: false,
      })
    : '';

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'hover:bg-muted/65 flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-all',
        isActive && 'bg-primary/8 ring-primary/20 shadow-sm ring-1'
      )}
    >
      <div className="bg-muted text-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-medium shadow-sm">
        {contact?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={contact.avatar_url}
            alt={displayName}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          initials
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-foreground truncate text-sm font-medium">
            {displayName}
          </span>
          <span className="text-muted-foreground shrink-0 text-[10px]">
            {timeAgo}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="text-muted-foreground truncate text-xs">
            {conversation.last_message_text || t('noMessagesYet')}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {conversation.unread_count > 0 && (
              <span className="bg-primary text-primary-foreground flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold">
                {conversation.unread_count}
              </span>
            )}
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                STATUS_COLORS[conversation.status]
              )}
              title={conversation.status}
            />
          </div>
        </div>

        {(needsReply ||
          contact?.client_reference ||
          dealCount > 0 ||
          appointmentCount > 0 ||
          automationActive ||
          tags.length > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {contact?.client_reference && (
              <MiniBadge className="bg-primary/10 text-primary">
                Ref. {contact.client_reference}
              </MiniBadge>
            )}
            {needsReply && (
              <MiniBadge className="bg-amber-500/15 text-amber-500">
                <MessageCircleReply className="h-3 w-3" />
                Reply
              </MiniBadge>
            )}
            {dealCount > 0 && (
              <MiniBadge className="bg-emerald-500/15 text-emerald-500">
                <Briefcase className="h-3 w-3" />
                {dealCount}
              </MiniBadge>
            )}
            {appointmentCount > 0 && (
              <MiniBadge className="bg-sky-500/15 text-sky-500">
                <CalendarClock className="h-3 w-3" />
                {appointmentCount}
              </MiniBadge>
            )}
            {firstStage && (
              <MiniBadge className="bg-muted text-muted-foreground">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: firstStage.color }}
                />
                <span className="max-w-20 truncate">{firstStage.name}</span>
              </MiniBadge>
            )}
            {automationActive && (
              <MiniBadge className="bg-violet-500/15 text-violet-500">
                <Bot className="h-3 w-3" />
                Auto
              </MiniBadge>
            )}
            {tags.map((tag) => (
              <MiniBadge
                key={tag.id}
                className="bg-muted text-muted-foreground"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="max-w-16 truncate">{tag.name}</span>
              </MiniBadge>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

function FilterChip({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <button
      onClick={onClear}
      className="bg-muted text-foreground hover:bg-muted/70 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
    >
      <span className="max-w-24 truncate">{label}</span>
      <X className="h-3 w-3" />
    </button>
  );
}

function MiniBadge({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        className
      )}
    >
      {children}
    </span>
  );
}
