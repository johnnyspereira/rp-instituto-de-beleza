// Shared result shapes the dashboard components consume. Centralised
// here so each component stays thin and the page-level loader wires
// them up without type gymnastics.

export interface MetricDelta {
  current: number;
  previous: number;
}

export interface MetricsBundle {
  activeConversations: MetricDelta;
  newContactsToday: MetricDelta;
  openDealsValue: number;
  openDealsCount: number;
  messagesSentToday: MetricDelta;
}

export interface TodayAppointmentItem {
  id: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  contactName: string;
  contactPhone: string | null;
  serviceName: string;
  professionalName: string;
  roomName: string | null;
  price: number;
  currency: string;
  arrived: boolean;
  paid: boolean;
  benefit: 'voucher' | 'pack' | 'referral' | null;
  href: string;
}

export interface TodayOperations {
  generatedAt: string;
  appointmentsTotal: number;
  confirmed: number;
  arrived: number;
  completed: number;
  cancelled: number;
  noShow: number;
  expectedRevenue: number;
  receivedToday: number;
  salesToday: number;
  outstandingToday: number;
  cashSessionOpen: boolean;
  benefitsScheduled: number;
  appointments: TodayAppointmentItem[];
}

export interface ExpiringBenefitItem {
  id: string;
  type: 'voucher' | 'pack';
  contactId: string;
  contactName: string;
  label: string;
  code: string | null;
  expiresAt: string;
  remainingLabel: string;
}

export interface PortalPendingConfirmationItem {
  id: string;
  contactName: string;
  serviceName: string;
  scheduledStart: string;
  professionalName: string;
  href: string;
  kind: 'confirmation' | 'reschedule';
  requestedStart?: string | null;
}

export interface WhatsAppHealth {
  qrConnected: boolean;
  qrState:
    | 'idle'
    | 'starting'
    | 'qr'
    | 'connected'
    | 'disconnected'
    | 'error'
    | 'unknown';
  qrConnectedAt: string | null;
  qrConnectedForSeconds: number | null;
  qrUserJid: string | null;
  qrLastError: string | null;
  metaConnected: boolean;
  metaConnectedAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastSyncLabel: string | null;
}

export interface InboxOperations {
  open: number;
  pending: number;
  closed: number;
  unread: number;
  unassigned: number;
  withoutDeal: number;
  waitingCustomer: number;
  waitingAgent: number;
  automationActive: number;
  critical: InboxCriticalItem[];
}

export interface InboxCriticalItem {
  id: string;
  contactName: string;
  contactPhone: string;
  lastMessageText: string;
  lastMessageAt: string | null;
  unreadCount: number;
  href: string;
}

export interface SalesInsights {
  activeDeals: number;
  wonDealsToday: number;
  stalledDeals: number;
  noDealConversations: number;
  forecastValue: number;
  topStage: {
    name: string;
    count: number;
    value: number;
  } | null;
}

export interface AutomationInsights {
  activeAutomations: number;
  inactiveAutomations: number;
  failedLogs24h: number;
  triggeredToday: number;
  activeFlowRuns: number;
  pausedByAgent: number;
  aiGeneratedToday: number;
}

export interface TeamPerformance {
  agents: TeamAgentPerformance[];
  unassignedOpen: number;
}

export interface TeamAgentPerformance {
  id: string;
  name: string;
  email: string | null;
  assignedOpen: number;
  sentToday: number;
  avgResponseMinutes: number | null;
}

export interface DashboardAlert {
  id: string;
  tone: 'critical' | 'warning' | 'info' | 'success';
  title: string;
  detail: string;
  href?: string;
}

export interface ConversationsSeriesPoint {
  day: string; // YYYY-MM-DD local
  incoming: number;
  outgoing: number;
}

export interface PipelineStageSlice {
  id: string;
  name: string;
  color: string;
  dealCount: number;
  totalValue: number;
}

export interface PipelineDonutData {
  stages: PipelineStageSlice[];
  totalValue: number;
}

export interface ResponseTimeBucket {
  /** 0 = Mon … 6 = Sun (Monday-first). */
  dow: number;
  /** Average first-response time in minutes. Null means no samples. */
  avgMinutes: number | null;
  samples: number;
}

export interface ResponseTimeSummary {
  buckets: ResponseTimeBucket[];
  thisWeekAvg: number | null;
  lastWeekAvg: number | null;
}

export type ActivityKind =
  'message' | 'deal' | 'broadcast' | 'automation' | 'contact';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  /** Primary line of text rendered in the feed. Pre-formatted. */
  text: string;
  /** ISO timestamp the item happened at, drives relative-time + sort. */
  at: string;
  /** Optional deep-link for the whole row (not all items have a target). */
  href?: string;
}
