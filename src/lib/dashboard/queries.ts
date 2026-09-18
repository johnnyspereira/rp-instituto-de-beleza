import type { SupabaseClient } from '@supabase/supabase-js';
import {
  daysAgoStart,
  DOW_SHORT_MON_FIRST,
  lastNDayKeys,
  localDayKey,
  mondayIndex,
  startOfLocalDay,
} from './date-utils';
import type {
  ActivityItem,
  AutomationInsights,
  ConversationsSeriesPoint,
  DashboardAlert,
  InboxOperations,
  MetricsBundle,
  PipelineDonutData,
  PipelineStageSlice,
  ResponseTimeBucket,
  ResponseTimeSummary,
  SalesInsights,
  TeamPerformance,
  TodayOperations,
  ExpiringBenefitItem,
  PortalPendingConfirmationItem,
  WhatsAppHealth,
} from './types';

// ------------------------------------------------------------
// All client-side aggregation. RLS scopes every query to the
// signed-in user automatically, so we never pass user_id explicitly
// here. Perf is acceptable for the current scale (low thousands of
// messages) — if a tenant's dataset outgrows this, we'd migrate the
// heavy aggregations to SQL RPCs. Noted in the PR.
// ------------------------------------------------------------

type DB = SupabaseClient;

type BaileysStatusPayload = {
  connected?: boolean;
  state?: WhatsAppHealth['qrState'];
  connectedAt?: string | null;
  connectedForSeconds?: number | null;
  userJid?: string | null;
  lastError?: string | null;
};

type DashboardConversationRow = {
  id: string;
  contact_id: string | null;
  status: 'open' | 'pending' | 'closed';
  assigned_agent_id: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number | null;
  contact:
    | { name: string | null; phone: string | null }[]
    | { name: string | null; phone: string | null }
    | null;
};

type DashboardMessageRow = {
  id: string;
  conversation_id: string;
  sender_type: string;
  sender_id?: string | null;
  created_at: string;
};

const asSingle = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

export async function loadExpiringBenefits(
  db: DB
): Promise<ExpiringBenefitItem[]> {
  const now = new Date();
  const until = new Date(now.getTime() + 30 * 86_400_000).toISOString();
  const [vouchersRes, packsRes] = await Promise.all([
    db
      .from('finance_vouchers')
      .select('id,owner_contact_id,code,voucher_type,remaining_uses,current_balance,currency,expires_at,owner:contacts(name,phone),service:clinic_services(name)')
      .eq('status', 'active')
      .not('expires_at', 'is', null)
      .gt('expires_at', now.toISOString())
      .lte('expires_at', until)
      .order('expires_at', { ascending: true })
      .limit(20),
    db
      .from('finance_client_packs')
      .select('id,contact_id,code,expires_at,contact:contacts(name,phone),pack:finance_pack_catalog(name),balances:finance_client_pack_balances(remaining_sessions)')
      .eq('status', 'active')
      .not('expires_at', 'is', null)
      .gt('expires_at', now.toISOString())
      .lte('expires_at', until)
      .order('expires_at', { ascending: true })
      .limit(20),
  ]);
  // Finance is optional during an incremental deployment. A missing finance
  // relation must not prevent the entire dashboard from loading.
  if (vouchersRes.error || packsRes.error) return [];
  type VoucherRow = {
    id: string; owner_contact_id: string | null; code: string | null;
    voucher_type: string; remaining_uses: number | null; current_balance: number | null;
    currency: string | null; expires_at: string; owner: { name: string | null; phone: string | null } | Array<{ name: string | null; phone: string | null }> | null;
    service: { name: string | null } | Array<{ name: string | null }> | null;
  };
  type PackRow = {
    id: string; contact_id: string; code: string | null; expires_at: string;
    contact: { name: string | null; phone: string | null } | Array<{ name: string | null; phone: string | null }> | null;
    pack: { name: string | null } | Array<{ name: string | null }> | null;
    balances: Array<{ remaining_sessions: number | null }> | null;
  };
  const vouchers = ((vouchersRes.data ?? []) as unknown as VoucherRow[])
    .filter((item) => (item.voucher_type === 'service' ? Number(item.remaining_uses) > 0 : Number(item.current_balance) > 0))
    .map((item): ExpiringBenefitItem => {
      const owner = asSingle(item.owner);
      const service = asSingle(item.service);
      return {
        id: item.id, type: 'voucher', contactId: item.owner_contact_id ?? '',
        contactName: owner?.name || owner?.phone || 'Cliente sem nome',
        label: service?.name || 'Voucher', code: item.code, expiresAt: item.expires_at,
        remainingLabel: item.voucher_type === 'service'
          ? `${Number(item.remaining_uses ?? 0)} sessão`
          : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: item.currency || 'EUR' }).format(Number(item.current_balance ?? 0)),
      };
    });
  const packs = ((packsRes.data ?? []) as unknown as PackRow[])
    .map((item): ExpiringBenefitItem => {
      const contact = asSingle(item.contact);
      const pack = asSingle(item.pack);
      const sessions = (item.balances ?? []).reduce((sum, balance) => sum + Number(balance.remaining_sessions ?? 0), 0);
      return { id: item.id, type: 'pack', contactId: item.contact_id,
        contactName: contact?.name || contact?.phone || 'Cliente sem nome',
        label: pack?.name || 'Pack de sessões', code: item.code, expiresAt: item.expires_at,
        remainingLabel: `${sessions} sessão${sessions === 1 ? '' : 'ões'}` };
    })
    .filter((item) => Number(item.remainingLabel.split(' ')[0]) > 0);
  return [...vouchers, ...packs]
    .filter((item) => item.contactId)
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())
    .slice(0, 12);
}

export async function loadPortalPendingConfirmations(
  db: DB
): Promise<PortalPendingConfirmationItem[]> {
  const { data, error } = await db
    .from('clinic_appointments')
    .select(
      'id,scheduled_start,contact:contacts(name,phone),service:clinic_services(name),professional:profiles!clinic_appointments_professional_profile_id_fkey(full_name,email)'
    )
    .eq('source', 'client_portal')
    .eq('confirmation_status', 'pending')
    .in('status', ['scheduled', 'confirmed'])
    .order('scheduled_start', { ascending: true })
    .limit(8);
  // The Portal 360 migration can be applied after the dashboard code. Until
  // then there simply are no pending portal confirmations to show.
  if (error) return [];

  type PortalRow = {
    id: string;
    scheduled_start: string;
    contact: { name: string | null; phone: string | null } | Array<{ name: string | null; phone: string | null }> | null;
    service: { name: string | null } | Array<{ name: string | null }> | null;
    professional: { full_name: string | null; email: string | null } | Array<{ full_name: string | null; email: string | null }> | null;
  };
  const confirmations = ((data ?? []) as unknown as PortalRow[]).map((row) => {
    const contact = asSingle(row.contact);
    const service = asSingle(row.service);
    const professional = asSingle(row.professional);
    return {
      id: row.id,
      contactName: contact?.name || contact?.phone || 'Cliente sem nome',
      serviceName: service?.name || 'Sessão',
      scheduledStart: row.scheduled_start,
      professionalName: professional?.full_name || professional?.email || 'Profissional',
      href: `/agenda?appointment=${row.id}&date=${row.scheduled_start.slice(0, 10)}`,
      kind: 'confirmation' as const,
    };
  });

  // A Portal 360 request to change time is also an approval task. Keep it
  // beside normal confirmations, without changing the appointment itself.
  const { data: events, error: eventsError } = await db
    .from('clinic_agenda_events')
    .select('entity_id,metadata,new_starts_at,created_at')
    .eq('entity_type', 'appointment')
    .eq('action', 'status_changed')
    .order('created_at', { ascending: false })
    .limit(80);
  if (eventsError || !events?.length) return confirmations;

  const pendingEvents = (events as Array<{
    entity_id: string;
    metadata: unknown;
    new_starts_at: string | null;
  }>).filter((event) => {
    const metadata = typeof event.metadata === 'object' && event.metadata
      ? event.metadata as Record<string, unknown>
      : null;
    return metadata?.kind === 'portal_reschedule' && metadata.state === 'awaiting_professional';
  });
  const eventByAppointment = new Map<string, (typeof pendingEvents)[number]>();
  for (const event of pendingEvents) {
    if (!eventByAppointment.has(event.entity_id)) eventByAppointment.set(event.entity_id, event);
  }
  const ids = [...eventByAppointment.keys()];
  if (!ids.length) return confirmations;
  const { data: requestedAppointments, error: requestedError } = await db
    .from('clinic_appointments')
    .select('id,scheduled_start,contact:contacts(name,phone),service:clinic_services(name),professional:profiles!clinic_appointments_professional_profile_id_fkey(full_name,email)')
    .in('id', ids)
    .in('status', ['scheduled', 'confirmed']);
  if (requestedError) return confirmations;
  const reschedules = ((requestedAppointments ?? []) as unknown as PortalRow[]).map((row) => {
    const contact = asSingle(row.contact);
    const service = asSingle(row.service);
    const professional = asSingle(row.professional);
    const event = eventByAppointment.get(row.id);
    return {
      id: row.id,
      contactName: contact?.name || contact?.phone || 'Cliente sem nome',
      serviceName: service?.name || 'Sessão',
      scheduledStart: row.scheduled_start,
      professionalName: professional?.full_name || professional?.email || 'Profissional',
      href: `/agenda?appointment=${row.id}&date=${row.scheduled_start.slice(0, 10)}`,
      kind: 'reschedule' as const,
      requestedStart: event?.new_starts_at ?? null,
    };
  });
  const existing = new Set(confirmations.map((item) => item.id));
  return [...confirmations, ...reschedules.filter((item) => !existing.has(item.id))].slice(0, 8);
}

const safeCount = async (
  query: PromiseLike<{ count: number | null; error: unknown }>
) => {
  const result = await query;
  if (result.error) return 0;
  return result.count ?? 0;
};

function minutesBetween(a: string, b: string) {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60_000);
}

function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function throwFirstQueryError(...results: Array<{ error?: unknown | null }>) {
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

export async function loadTodayOperations(db: DB): Promise<TodayOperations> {
  const start = startOfLocalDay();
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [appointmentsRes, paymentsRes, salesRes, cashSessionRes] =
    await Promise.all([
      db
        .from('clinic_appointments')
        .select(
          'id, scheduled_start, scheduled_end, status, price, currency, arrived_at, paid_at, referral_id, contact:contacts(name, phone), service:clinic_services(name), professional:profiles!clinic_appointments_professional_profile_id_fkey(full_name, email), room:clinic_rooms(name)'
        )
        .gte('scheduled_start', startIso)
        .lt('scheduled_start', endIso)
        .order('scheduled_start'),
      db
        .from('finance_payments')
        .select('amount, status')
        .eq('status', 'confirmed')
        .gte('paid_at', startIso)
        .lt('paid_at', endIso),
      db
        .from('finance_sales')
        .select('id, status, balance_due')
        .gte('created_at', startIso)
        .lt('created_at', endIso),
      db
        .from('finance_cash_sessions')
        .select('id')
        .eq('status', 'open')
        .limit(1)
        .maybeSingle(),
    ]);

  // The agenda is the primary daily view. Finance widgets can be unavailable
  // while their migrations catch up, but must not take the agenda down.
  if (appointmentsRes.error) throw appointmentsRes.error;

  type AppointmentData = {
    id: string;
    scheduled_start: string;
    scheduled_end: string;
    status: TodayOperations['appointments'][number]['status'];
    price: number | null;
    currency: string | null;
    arrived_at: string | null;
    paid_at: string | null;
    referral_id: string | null;
    contact:
      | { name: string | null; phone: string | null }
      | Array<{ name: string | null; phone: string | null }>
      | null;
    service: { name: string | null } | Array<{ name: string | null }> | null;
    professional:
      | { full_name: string | null; email: string | null }
      | Array<{ full_name: string | null; email: string | null }>
      | null;
    room: { name: string | null } | Array<{ name: string | null }> | null;
    benefits?: Array<{
      benefit_type: 'voucher' | 'pack';
      status: string;
    }> | null;
  };

  const rows = (appointmentsRes.data ?? []) as unknown as AppointmentData[];
  const appointments = rows.map((row) => {
    const contact = asSingle(row.contact);
    const service = asSingle(row.service);
    const professional = asSingle(row.professional);
    const room = asSingle(row.room);
    const benefit = row.benefits?.find((item) =>
      ['reserved', 'consumed'].includes(item.status)
    );
    return {
      id: row.id,
      scheduledStart: row.scheduled_start,
      scheduledEnd: row.scheduled_end,
      status: row.status,
      contactName: contact?.name || contact?.phone || 'Cliente sem nome',
      contactPhone: contact?.phone ?? null,
      serviceName: service?.name || 'Procedimento',
      professionalName:
        professional?.full_name || professional?.email || 'Sem profissional',
      roomName: room?.name ?? null,
      price: Number(row.price ?? 0),
      currency: row.currency || 'EUR',
      arrived: Boolean(row.arrived_at),
      paid: Boolean(row.paid_at),
      benefit: row.referral_id
        ? ('referral' as const)
        : (benefit?.benefit_type ?? null),
      href: `/agenda?appointment=${row.id}&date=${row.scheduled_start.slice(0, 10)}`,
    };
  });

  const sales = (salesRes.error ? [] : salesRes.data ?? []) as Array<{
    status: string;
    balance_due: number | null;
  }>;
  return {
    generatedAt: new Date().toISOString(),
    appointmentsTotal: rows.length,
    confirmed: rows.filter((row) => row.status === 'confirmed').length,
    arrived: rows.filter((row) => Boolean(row.arrived_at)).length,
    completed: rows.filter((row) => row.status === 'completed').length,
    cancelled: rows.filter((row) => row.status === 'cancelled').length,
    noShow: rows.filter((row) => row.status === 'no_show').length,
    expectedRevenue: rows
      .filter((row) => !['cancelled', 'no_show'].includes(row.status))
      .reduce((sum, row) => sum + Number(row.price ?? 0), 0),
    receivedToday: (paymentsRes.error ? [] : paymentsRes.data ?? []).reduce(
      (sum, payment) => sum + Number(payment.amount ?? 0),
      0
    ),
    salesToday: sales.filter(
      (sale) => !['voided', 'refunded'].includes(sale.status)
    ).length,
    outstandingToday: sales
      .filter((sale) => ['open', 'partially_paid'].includes(sale.status))
      .reduce((sum, sale) => sum + Number(sale.balance_due ?? 0), 0),
    cashSessionOpen: cashSessionRes.error ? false : Boolean(cashSessionRes.data),
    benefitsScheduled: appointments.filter((item) => item.benefit).length,
    appointments,
  };
}

// --- 1. Metric cards ---------------------------------------------------

export async function loadMetrics(db: DB): Promise<MetricsBundle> {
  const todayStart = startOfLocalDay().toISOString();
  const yesterdayStart = daysAgoStart(1).toISOString();

  const [
    openConvCur,
    newConvToday,
    newConvYesterday,
    newContactsToday,
    newContactsYesterday,
    openDeals,
    messagesToday,
    messagesYesterday,
  ] = await Promise.all([
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open'),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .gte('created_at', todayStart),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    db
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStart),
    db
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    db.from('deals').select('value, status').eq('status', 'open'),
    db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_type', 'agent')
      .gte('created_at', todayStart),
    db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_type', 'agent')
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
  ]);

  throwFirstQueryError(
    openConvCur,
    newConvToday,
    newConvYesterday,
    newContactsToday,
    newContactsYesterday,
    openDeals,
    messagesToday,
    messagesYesterday
  );

  const openDealsRows = (openDeals.data ?? []) as { value: number | null }[];
  const openDealsValue = openDealsRows.reduce(
    (sum, d) => sum + (d.value ?? 0),
    0
  );

  return {
    activeConversations: {
      current: openConvCur.count ?? 0,
      // "vs yesterday" on a current-state count has no clean answer
      // without snapshots — we show the delta in NEW open conversations
      // today vs yesterday. That's the business-meaningful daily signal.
      previous: (newConvToday.count ?? 0) - (newConvYesterday.count ?? 0),
    },
    newContactsToday: {
      current: newContactsToday.count ?? 0,
      previous: newContactsYesterday.count ?? 0,
    },
    openDealsValue,
    openDealsCount: openDealsRows.length,
    messagesSentToday: {
      current: messagesToday.count ?? 0,
      previous: messagesYesterday.count ?? 0,
    },
  };
}

// --- 1b. WhatsApp health ----------------------------------------------

export async function loadWhatsAppHealth(db: DB): Promise<WhatsAppHealth> {
  const [configRes, lastInboundRes, lastOutboundRes, qrStatus] =
    await Promise.all([
      db.from('whatsapp_config').select('status, connected_at').maybeSingle(),
      db
        .from('messages')
        .select('created_at')
        .eq('sender_type', 'customer')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from('messages')
        .select('created_at')
        .in('sender_type', ['agent', 'bot'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      fetch('/api/whatsapp/baileys/status', {
        credentials: 'include',
        cache: 'no-store',
      })
        .then((res) =>
          res.ok ? (res.json() as Promise<BaileysStatusPayload>) : null
        )
        .catch(() => null),
    ]);

  return {
    qrConnected: Boolean(qrStatus?.connected),
    qrState: qrStatus?.state ?? 'unknown',
    qrConnectedAt:
      typeof qrStatus?.connectedAt === 'string' ? qrStatus.connectedAt : null,
    qrConnectedForSeconds:
      typeof qrStatus?.connectedForSeconds === 'number'
        ? qrStatus.connectedForSeconds
        : null,
    qrUserJid: typeof qrStatus?.userJid === 'string' ? qrStatus.userJid : null,
    qrLastError:
      typeof qrStatus?.lastError === 'string' ? qrStatus.lastError : null,
    metaConnected: configRes.data?.status === 'connected',
    metaConnectedAt:
      typeof configRes.data?.connected_at === 'string'
        ? configRes.data.connected_at
        : null,
    lastInboundAt: lastInboundRes.data?.created_at ?? null,
    lastOutboundAt: lastOutboundRes.data?.created_at ?? null,
    lastSyncLabel: null,
  };
}

// --- 1c. Inbox operations ---------------------------------------------

export async function loadInboxOperations(db: DB): Promise<InboxOperations> {
  const [conversationsRes, dealsRes, messagesRes, activeRunsRes] =
    await Promise.all([
      db
        .from('conversations')
        .select(
          'id, contact_id, status, assigned_agent_id, last_message_text, last_message_at, unread_count, contact:contacts(name, phone)'
        )
        .order('last_message_at', { ascending: false, nullsFirst: false }),
      db.from('deals').select('contact_id, status').eq('status', 'open'),
      db
        .from('messages')
        .select('conversation_id, sender_type, created_at')
        .order('created_at', { ascending: false })
        .limit(1000),
      db.from('flow_runs').select('contact_id, status').eq('status', 'active'),
    ]);

  throwFirstQueryError(conversationsRes, dealsRes, messagesRes, activeRunsRes);

  const conversations = (conversationsRes.data ??
    []) as unknown as DashboardConversationRow[];
  const openDealsContactIds = new Set(
    ((dealsRes.data ?? []) as Array<{ contact_id: string | null }>)
      .map((deal) => deal.contact_id)
      .filter(Boolean) as string[]
  );
  const activeFlowContactIds = new Set(
    ((activeRunsRes.data ?? []) as Array<{ contact_id: string | null }>)
      .map((run) => run.contact_id)
      .filter(Boolean) as string[]
  );

  const latestSenderByConversation = new Map<string, string>();
  for (const message of (messagesRes.data ?? []) as DashboardMessageRow[]) {
    if (!latestSenderByConversation.has(message.conversation_id)) {
      latestSenderByConversation.set(
        message.conversation_id,
        message.sender_type
      );
    }
  }

  let open = 0;
  let pending = 0;
  let closed = 0;
  let unread = 0;
  let unassigned = 0;
  let withoutDeal = 0;
  let waitingCustomer = 0;
  let waitingAgent = 0;
  let automationActive = 0;

  for (const conversation of conversations) {
    if (conversation.status === 'open') open += 1;
    if (conversation.status === 'pending') pending += 1;
    if (conversation.status === 'closed') closed += 1;

    const isActiveThread = conversation.status !== 'closed';
    if ((conversation.unread_count ?? 0) > 0) unread += 1;
    if (isActiveThread && !conversation.assigned_agent_id) unassigned += 1;
    if (
      isActiveThread &&
      conversation.contact_id &&
      !openDealsContactIds.has(conversation.contact_id)
    ) {
      withoutDeal += 1;
    }
    if (isActiveThread && conversation.contact_id) {
      if (activeFlowContactIds.has(conversation.contact_id))
        automationActive += 1;
    }

    const latestSender = latestSenderByConversation.get(conversation.id);
    if (isActiveThread && latestSender === 'customer') waitingAgent += 1;
    if (
      isActiveThread &&
      (latestSender === 'agent' || latestSender === 'bot')
    ) {
      waitingCustomer += 1;
    }
  }

  const critical = conversations
    .filter(
      (conversation) =>
        conversation.status !== 'closed' &&
        ((conversation.unread_count ?? 0) > 0 ||
          !conversation.assigned_agent_id)
    )
    .slice(0, 6)
    .map((conversation) => {
      const contact = asSingle(conversation.contact);
      return {
        id: conversation.id,
        contactName: contact?.name || contact?.phone || 'Unknown',
        contactPhone: contact?.phone || '',
        lastMessageText: conversation.last_message_text || '',
        lastMessageAt: conversation.last_message_at,
        unreadCount: conversation.unread_count ?? 0,
        href: `/inbox?c=${conversation.id}`,
      };
    });

  return {
    open,
    pending,
    closed,
    unread,
    unassigned,
    withoutDeal,
    waitingCustomer,
    waitingAgent,
    automationActive,
    critical,
  };
}

// --- 1d. Sales insights -----------------------------------------------

export async function loadSalesInsights(db: DB): Promise<SalesInsights> {
  const todayStart = startOfLocalDay().toISOString();
  const staleThreshold = daysAgoStart(14).toISOString();

  const [dealsRes, stagesRes, conversationsRes] = await Promise.all([
    db
      .from('deals')
      .select('id, value, status, stage_id, contact_id, updated_at'),
    db.from('pipeline_stages').select('id, name'),
    db.from('conversations').select('id, contact_id, status'),
  ]);

  throwFirstQueryError(dealsRes, stagesRes, conversationsRes);

  const deals = (dealsRes.data ?? []) as Array<{
    id: string;
    value: number | null;
    status: 'open' | 'won' | 'lost' | null;
    stage_id: string | null;
    contact_id: string | null;
    updated_at: string | null;
  }>;
  const stagesById = new Map(
    ((stagesRes.data ?? []) as Array<{ id: string; name: string }>).map(
      (stage) => [stage.id, stage.name]
    )
  );
  const openDeals = deals.filter((deal) => deal.status === 'open');
  const openDealContactIds = new Set(
    openDeals.map((deal) => deal.contact_id).filter(Boolean) as string[]
  );
  const activeConversations = (conversationsRes.data ?? []) as Array<{
    id: string;
    contact_id: string | null;
    status: string;
  }>;

  const byStage = new Map<string, { count: number; value: number }>();
  for (const deal of openDeals) {
    const stageId = deal.stage_id || 'unknown';
    const current = byStage.get(stageId) ?? { count: 0, value: 0 };
    current.count += 1;
    current.value += deal.value ?? 0;
    byStage.set(stageId, current);
  }

  const top = Array.from(byStage.entries()).sort(
    (a, b) => b[1].value - a[1].value
  )[0];

  return {
    activeDeals: openDeals.length,
    wonDealsToday: deals.filter(
      (deal) =>
        deal.status === 'won' &&
        deal.updated_at !== null &&
        deal.updated_at >= todayStart
    ).length,
    stalledDeals: openDeals.filter(
      (deal) => deal.updated_at !== null && deal.updated_at < staleThreshold
    ).length,
    noDealConversations: activeConversations.filter(
      (conversation) =>
        conversation.status !== 'closed' &&
        conversation.contact_id &&
        !openDealContactIds.has(conversation.contact_id)
    ).length,
    forecastValue: openDeals.reduce((sum, deal) => sum + (deal.value ?? 0), 0),
    topStage: top
      ? {
          name: stagesById.get(top[0]) ?? 'Unknown',
          count: top[1].count,
          value: top[1].value,
        }
      : null,
  };
}

// --- 1e. Automations + AI ---------------------------------------------

export async function loadAutomationInsights(
  db: DB
): Promise<AutomationInsights> {
  const todayStart = startOfLocalDay().toISOString();
  const yesterdayStart = daysAgoStart(1).toISOString();

  const [
    activeAutomations,
    inactiveAutomations,
    failedLogs24h,
    triggeredToday,
    activeFlowRuns,
    pausedByAgent,
    aiGeneratedToday,
  ] = await Promise.all([
    safeCount(
      db
        .from('automations')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
    ),
    safeCount(
      db
        .from('automations')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', false)
    ),
    safeCount(
      db
        .from('automation_logs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('created_at', yesterdayStart)
    ),
    safeCount(
      db
        .from('automation_logs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStart)
    ),
    safeCount(
      db
        .from('flow_runs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
    ),
    safeCount(
      db
        .from('flow_runs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'paused_by_agent')
    ),
    safeCount(
      db
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('ai_generated', true)
        .gte('created_at', todayStart)
    ),
  ]);

  return {
    activeAutomations,
    inactiveAutomations,
    failedLogs24h,
    triggeredToday,
    activeFlowRuns,
    pausedByAgent,
    aiGeneratedToday,
  };
}

// --- 1f. Team performance ---------------------------------------------

export async function loadTeamPerformance(db: DB): Promise<TeamPerformance> {
  const todayStart = startOfLocalDay().toISOString();
  const fourteenDaysAgo = daysAgoStart(13).toISOString();
  const [profilesRes, conversationsRes, messagesRes] = await Promise.all([
    db.from('profiles').select('user_id, full_name, email'),
    db.from('conversations').select('id, assigned_agent_id, status'),
    db
      .from('messages')
      .select('conversation_id, sender_type, sender_id, created_at')
      .gte('created_at', fourteenDaysAgo)
      .order('conversation_id', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);

  throwFirstQueryError(profilesRes, conversationsRes, messagesRes);

  const profiles = (profilesRes.data ?? []) as Array<{
    user_id: string;
    full_name: string | null;
    email: string | null;
  }>;
  const conversations = (conversationsRes.data ?? []) as Array<{
    id: string;
    assigned_agent_id: string | null;
    status: string;
  }>;
  const messages = (messagesRes.data ?? []) as DashboardMessageRow[];

  const assignedOpenByAgent = new Map<string, number>();
  let unassignedOpen = 0;
  for (const conversation of conversations) {
    if (conversation.status === 'closed') continue;
    if (!conversation.assigned_agent_id) {
      unassignedOpen += 1;
      continue;
    }
    assignedOpenByAgent.set(
      conversation.assigned_agent_id,
      (assignedOpenByAgent.get(conversation.assigned_agent_id) ?? 0) + 1
    );
  }

  const sentTodayByAgent = new Map<string, number>();
  for (const message of messages) {
    if (message.sender_type !== 'agent' || !message.sender_id) continue;
    if (message.created_at >= todayStart) {
      sentTodayByAgent.set(
        message.sender_id,
        (sentTodayByAgent.get(message.sender_id) ?? 0) + 1
      );
    }
  }

  const responseSamplesByAgent = new Map<string, number[]>();
  let currentConversation = '';
  let pendingCustomerAt: string | null = null;
  for (const message of messages) {
    if (message.conversation_id !== currentConversation) {
      currentConversation = message.conversation_id;
      pendingCustomerAt = null;
    }

    if (message.sender_type === 'customer') {
      if (!pendingCustomerAt) pendingCustomerAt = message.created_at;
      continue;
    }

    if (
      pendingCustomerAt &&
      message.sender_type === 'agent' &&
      message.sender_id
    ) {
      const samples = responseSamplesByAgent.get(message.sender_id) ?? [];
      samples.push(minutesBetween(pendingCustomerAt, message.created_at));
      responseSamplesByAgent.set(message.sender_id, samples);
      pendingCustomerAt = null;
    }
  }

  const profileIds = new Set(profiles.map((profile) => profile.user_id));
  for (const id of assignedOpenByAgent.keys()) profileIds.add(id);
  for (const id of sentTodayByAgent.keys()) profileIds.add(id);

  const agents = Array.from(profileIds)
    .map((id) => {
      const profile = profiles.find((item) => item.user_id === id);
      return {
        id,
        name: profile?.full_name || profile?.email || 'Agent',
        email: profile?.email ?? null,
        assignedOpen: assignedOpenByAgent.get(id) ?? 0,
        sentToday: sentTodayByAgent.get(id) ?? 0,
        avgResponseMinutes: average(responseSamplesByAgent.get(id) ?? []),
      };
    })
    .sort(
      (a, b) =>
        b.assignedOpen - a.assignedOpen ||
        b.sentToday - a.sentToday ||
        a.name.localeCompare(b.name)
    )
    .slice(0, 6);

  return { agents, unassignedOpen };
}

// --- 1g. Alerts --------------------------------------------------------

export function buildDashboardAlerts(input: {
  whatsapp: WhatsAppHealth | null;
  inbox: InboxOperations | null;
  automation: AutomationInsights | null;
  sales: SalesInsights | null;
}): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];

  if (
    input.whatsapp &&
    !input.whatsapp.qrConnected &&
    !input.whatsapp.metaConnected
  ) {
    alerts.push({
      id: 'whatsapp-offline',
      tone: 'critical',
      title: 'WhatsApp disconnected',
      detail: 'Connect QR or Meta before replying from the inbox.',
      href: '/settings?tab=whatsapp',
    });
  } else if (input.whatsapp?.qrConnected) {
    alerts.push({
      id: 'whatsapp-online',
      tone: 'success',
      title: 'WhatsApp QR online',
      detail: input.whatsapp.qrUserJid
        ? `Session ${input.whatsapp.qrUserJid} is active.`
        : 'QR session is active and ready to send.',
      href: '/settings?tab=whatsapp',
    });
  }

  if ((input.inbox?.waitingAgent ?? 0) > 0) {
    alerts.push({
      id: 'waiting-agent',
      tone: 'warning',
      title: 'Customers waiting',
      detail: `${input.inbox?.waitingAgent ?? 0} active conversations need a reply.`,
      href: '/inbox',
    });
  }

  if ((input.inbox?.unassigned ?? 0) > 0) {
    alerts.push({
      id: 'unassigned',
      tone: 'info',
      title: 'Unassigned conversations',
      detail: `${input.inbox?.unassigned ?? 0} open conversations have no owner.`,
      href: '/inbox',
    });
  }

  if ((input.automation?.failedLogs24h ?? 0) > 0) {
    alerts.push({
      id: 'automation-failed',
      tone: 'critical',
      title: 'Automation failures',
      detail: `${input.automation?.failedLogs24h ?? 0} failures in the last 24 hours.`,
      href: '/automations',
    });
  }

  if ((input.sales?.stalledDeals ?? 0) > 0) {
    alerts.push({
      id: 'stalled-deals',
      tone: 'warning',
      title: 'Stalled deals',
      detail: `${input.sales?.stalledDeals ?? 0} open deals have not moved in 14 days.`,
      href: '/pipelines',
    });
  }

  return alerts.slice(0, 5);
}

// --- 2. Conversations over time ---------------------------------------

export async function loadConversationsSeries(
  db: DB,
  rangeDays: number
): Promise<ConversationsSeriesPoint[]> {
  const start = daysAgoStart(rangeDays - 1).toISOString();
  const { data, error } = await db
    .from('messages')
    .select('created_at, sender_type')
    .gte('created_at', start)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const keys = lastNDayKeys(rangeDays);
  const buckets = new Map<string, { incoming: number; outgoing: number }>();
  for (const k of keys) buckets.set(k, { incoming: 0, outgoing: 0 });

  for (const row of (data ?? []) as {
    created_at: string;
    sender_type: string;
  }[]) {
    const key = localDayKey(row.created_at);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (row.sender_type === 'customer') bucket.incoming += 1;
    else bucket.outgoing += 1; // agent + bot both count as outgoing
  }

  return keys.map((day) => ({
    day,
    ...(buckets.get(day) ?? { incoming: 0, outgoing: 0 }),
  }));
}

// --- 3. Pipeline donut -------------------------------------------------

export async function loadPipelineDonut(db: DB): Promise<PipelineDonutData> {
  const [stagesRes, dealsRes] = await Promise.all([
    db
      .from('pipeline_stages')
      .select('id, name, color, pipeline_id, position')
      .order('position'),
    db.from('deals').select('stage_id, value, status').eq('status', 'open'),
  ]);

  throwFirstQueryError(stagesRes, dealsRes);

  const stages = (stagesRes.data ?? []) as {
    id: string;
    name: string;
    color: string;
  }[];
  const deals = (dealsRes.data ?? []) as {
    stage_id: string;
    value: number | null;
  }[];

  const byStage = new Map<string, { count: number; total: number }>();
  for (const d of deals) {
    const row = byStage.get(d.stage_id) ?? { count: 0, total: 0 };
    row.count += 1;
    row.total += d.value ?? 0;
    byStage.set(d.stage_id, row);
  }

  const slices: PipelineStageSlice[] = stages
    .map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color || '#64748b',
      dealCount: byStage.get(s.id)?.count ?? 0,
      totalValue: byStage.get(s.id)?.total ?? 0,
    }))
    // Hide empty stages from the ring (but we'd still show them in the
    // legend if the user wanted a full breakdown — trimming keeps the
    // visual clean for the common case).
    .filter((s) => s.totalValue > 0 || s.dealCount > 0);

  return {
    stages: slices,
    totalValue: slices.reduce((sum, s) => sum + s.totalValue, 0),
  };
}

// --- 4. Response time by day of week ----------------------------------

export async function loadResponseTime(db: DB): Promise<ResponseTimeSummary> {
  // Pull the last 14 days of messages in one shot, then walk per
  // conversation to find each "first inbound" → "first subsequent
  // outbound" pair. 14 days gives us both "this week" + "last week"
  // with enough overlap if the user opens the dashboard late on a
  // Monday.
  const fourteenDaysAgo = daysAgoStart(13).toISOString();
  const { data, error } = await db
    .from('messages')
    .select('conversation_id, sender_type, created_at')
    .gte('created_at', fourteenDaysAgo)
    .order('conversation_id', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as {
    conversation_id: string;
    sender_type: string;
    created_at: string;
  }[];

  // Group per conversation, pair unreplied customer messages with the
  // next outbound message from the agent/bot. A single customer message
  // can only count once (avoids inflating averages if the customer
  // double-messages while the agent takes time to reply).
  interface Sample {
    customerAt: Date;
    responseAt: Date;
  }
  const samples: Sample[] = [];

  let currentConv = '';
  let pendingCustomer: Date | null = null;
  for (const row of rows) {
    if (row.conversation_id !== currentConv) {
      currentConv = row.conversation_id;
      pendingCustomer = null;
    }
    const ts = new Date(row.created_at);
    if (row.sender_type === 'customer') {
      if (!pendingCustomer) pendingCustomer = ts;
    } else if (pendingCustomer) {
      samples.push({ customerAt: pendingCustomer, responseAt: ts });
      pendingCustomer = null;
    }
  }

  const now = new Date();
  const thisWeekStart = daysAgoStart(mondayIndex(now));
  const lastWeekStart = daysAgoStart(mondayIndex(now) + 7);

  // Per-day-of-week buckets, averaged over both weeks' worth of data
  // so each bar has more samples to stand on. If a day has no samples
  // its avgMinutes stays null and the chart renders the bar muted.
  const byDow = new Map<number, number[]>();
  for (let i = 0; i < 7; i++) byDow.set(i, []);
  const thisWeekMins: number[] = [];
  const lastWeekMins: number[] = [];

  for (const s of samples) {
    const diffMin = (s.responseAt.getTime() - s.customerAt.getTime()) / 60_000;
    if (diffMin < 0) continue;
    const dow = mondayIndex(s.customerAt);
    byDow.get(dow)!.push(diffMin);
    if (s.customerAt >= thisWeekStart) {
      thisWeekMins.push(diffMin);
    } else if (s.customerAt >= lastWeekStart && s.customerAt < thisWeekStart) {
      lastWeekMins.push(diffMin);
    }
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;

  const buckets: ResponseTimeBucket[] = Array.from({ length: 7 }, (_, dow) => {
    const samples = byDow.get(dow) ?? [];
    return {
      dow,
      avgMinutes: avg(samples),
      samples: samples.length,
    };
  });

  // Silence unused-label warnings — keep the arrays explicitly named
  // for readability above.
  void DOW_SHORT_MON_FIRST;

  return {
    buckets,
    thisWeekAvg: avg(thisWeekMins),
    lastWeekAvg: avg(lastWeekMins),
  };
}

// --- 5. Activity feed --------------------------------------------------

export async function loadActivity(
  db: DB,
  limit = 20
): Promise<ActivityItem[]> {
  // Pull ~10 from each source (plenty of headroom after merge-sort),
  // then interleave by timestamp. The individual per-table limits
  // keep the payload small; the final limit is enforced after sort.
  const [msgs, contacts, deals, broadcasts, autoLogs] = await Promise.all([
    db
      .from('messages')
      .select(
        'id, content_text, sender_type, created_at, conversation_id, conversations(contact_id, contacts(name, phone))'
      )
      .eq('sender_type', 'customer')
      .order('created_at', { ascending: false })
      .limit(10),
    db
      .from('contacts')
      .select('id, name, phone, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
    db
      .from('deals')
      .select('id, title, updated_at, stage:pipeline_stages(name)')
      .order('updated_at', { ascending: false })
      .limit(10),
    db
      .from('broadcasts')
      .select('id, name, status, total_recipients, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    db
      .from('automation_logs')
      .select(
        'id, trigger_event, status, created_at, automation:automations(name), contact:contacts(name, phone)'
      )
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  throwFirstQueryError(msgs, contacts, deals, broadcasts, autoLogs);

  const items: ActivityItem[] = [];

  // PostgREST returns nested selections as arrays by default, even when
  // the foreign key is 1:1. We normalise by taking [0] on each level.
  for (const m of (msgs.data ?? []) as unknown as Array<{
    id: string;
    content_text: string | null;
    created_at: string;
    conversation_id: string;
    conversations:
      | {
          contact_id: string | null;
          contacts:
            | { name: string | null; phone: string }[]
            | { name: string | null; phone: string }
            | null;
        }[]
      | {
          contact_id: string | null;
          contacts:
            | { name: string | null; phone: string }[]
            | { name: string | null; phone: string }
            | null;
        }
      | null;
  }>) {
    const conv = Array.isArray(m.conversations)
      ? m.conversations[0]
      : m.conversations;
    const contact = Array.isArray(conv?.contacts)
      ? conv?.contacts[0]
      : conv?.contacts;
    const who = contact?.name || contact?.phone || 'Cliente';
    items.push({
      id: `msg-${m.id}`,
      kind: 'message',
      text: `Nova mensagem de ${who}`,
      at: m.created_at,
      href: `/inbox?c=${m.conversation_id}`,
    });
  }

  for (const c of (contacts.data ?? []) as Array<{
    id: string;
    name: string | null;
    phone: string;
    created_at: string;
  }>) {
    items.push({
      id: `contact-${c.id}`,
      kind: 'contact',
      text: `Novo cliente: ${c.name || c.phone}`,
      at: c.created_at,
      href: `/contacts/${c.id}`,
    });
  }

  for (const d of (deals.data ?? []) as unknown as Array<{
    id: string;
    title: string;
    updated_at: string;
    stage: { name: string }[] | { name: string } | null;
  }>) {
    const stage = Array.isArray(d.stage) ? d.stage[0] : d.stage;
    items.push({
      id: `deal-${d.id}`,
      kind: 'deal',
      text: stage?.name
        ? `Negócio "${d.title}" em ${stage.name}`
        : `Negócio "${d.title}" atualizado`,
      at: d.updated_at,
      href: `/pipelines?deal=${d.id}`,
    });
  }

  for (const b of (broadcasts.data ?? []) as Array<{
    id: string;
    name: string;
    status: string;
    total_recipients: number;
    created_at: string;
  }>) {
    const label =
      b.status === 'sent'
        ? `enviada para ${b.total_recipients} clientes`
        : `${b.status} (${b.total_recipients} destinatários)`;
    items.push({
      id: `broadcast-${b.id}`,
      kind: 'broadcast',
      text: `Transmissão "${b.name}" ${label}`,
      at: b.created_at,
      href: `/broadcasts/${b.id}`,
    });
  }

  for (const l of (autoLogs.data ?? []) as unknown as Array<{
    id: string;
    trigger_event: string;
    status: string;
    created_at: string;
    automation: { name: string }[] | { name: string } | null;
    contact:
      | { name: string | null; phone: string }[]
      | { name: string | null; phone: string }
      | null;
  }>) {
    const automation = Array.isArray(l.automation)
      ? l.automation[0]
      : l.automation;
    const contact = Array.isArray(l.contact) ? l.contact[0] : l.contact;
    const who = contact?.name || contact?.phone || 'um cliente';
    const autoName = automation?.name || 'Automação';
    items.push({
      id: `auto-${l.id}`,
      kind: 'automation',
      text: `Automação "${autoName}" ${l.status === 'failed' ? 'falhou para' : 'foi disparada para'} ${who}`,
      at: l.created_at,
    });
  }

  return items
    .sort((a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : 0))
    .slice(0, limit);
}
