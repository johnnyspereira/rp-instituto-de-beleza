import path from 'path';
import { once } from 'events';
import type { EventEmitter } from 'events';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { promisify } from 'util';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe';
import { handleAppointmentConfirmationReply } from '@/lib/clinic/appointment-confirmation';
import {
  isValidE164,
  normalizePhone,
  phoneFromWhatsAppJid,
  sanitizePhoneForMeta,
} from '@/lib/whatsapp/phone-utils';
import type { InteractiveMessagePayload } from '@/lib/whatsapp/interactive';
import type { AutomationTriggerType } from '@/types';
import { messageDedupeKey } from '@/lib/whatsapp/message-dedupe';

export type BaileysSessionStatus = {
  connected: boolean;
  state: 'idle' | 'starting' | 'qr' | 'connected' | 'disconnected' | 'error';
  qr: string | null;
  lastError: string | null;
  userJid: string | null;
  connectedAt: string | null;
  connectedForSeconds: number | null;
  hasSavedAuth: boolean;
  isStarting: boolean;
  lastActivityAt: string | null;
  lastRestartAt: string | null;
  restartCount: number;
};

export type BaileysSyncResult = {
  chatsScanned: number;
  messagesScanned: number;
  messagesPersisted: number;
};

type BaileysOutboundContentType =
  | 'text'
  | 'template'
  | 'interactive'
  | 'image'
  | 'video'
  | 'document'
  | 'audio';

type BaileysSenderType = 'agent' | 'bot';

type SendViaBaileysInput = {
  text: string;
  contentType?: BaileysOutboundContentType;
  mediaUrl?: string | null;
  filename?: string | null;
  templateName?: string | null;
  interactivePayload?: InteractiveMessagePayload | null;
  replyToMessageId?: string | null;
  senderType?: BaileysSenderType;
};

type SentWhatsAppMessage = {
  id?: {
    _serialized?: string;
    id?: string;
  };
};

type SerializedJid = {
  _serialized?: string | null;
  id?: string | null;
  remote?: string | { _serialized?: string | null } | null;
  user?: string | null;
  fromMe?: boolean | null;
};

type WebStoreMessageModel = {
  serialize?: () => WebStoreMessageModel;
  id?: SerializedJid | null;
  chat?: { id?: SerializedJid | null } | null;
  to?: { _serialized?: string | null } | null;
  from?: { _serialized?: string | null } | null;
  body?: string | null;
  caption?: string | null;
  fromMe?: boolean | null;
  type?: string | null;
  ack?: number | null;
  t?: number | null;
  timestamp?: number | null;
  __x_id?: SerializedJid | null;
  __x_from?: { _serialized?: string | null } | null;
  __x_to?: { _serialized?: string | null } | null;
  __x_isSentByMe?: boolean | null;
  __x_ack?: number | null;
};

type WebStoreChatModel = {
  id?: SerializedJid | null;
  msgs?: {
    getModelsArray?: () => WebStoreMessageModel[];
    _models?: WebStoreMessageModel[];
    models?: WebStoreMessageModel[];
  } | null;
};

type WhatsAppContactLike = {
  pushname?: string | null;
  name?: string | null;
  shortName?: string | null;
  number?: string | null;
  id?: { user?: string | null; _serialized?: string | null } | null;
};

type WhatsAppMessageLike = {
  id?: SerializedJid | null;
  fromMe?: boolean;
  from?: string;
  to?: string;
  body?: string;
  caption?: string | null;
  type?: string;
  timestamp?: number;
  ack?: number | null;
  getContact?: () => Promise<WhatsAppContactLike>;
};

type QrDeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';
type WhatsAppClient = EventEmitter & {
  info?: { wid?: { _serialized?: string }; me?: { user?: string } };
  pupPage?: {
    evaluate: <TResult, TArg = unknown>(
      fn: (arg: TArg) => TResult,
      arg?: TArg
    ) => Promise<TResult>;
  };
  destroy: () => Promise<void>;
  getState: () => Promise<string | null | undefined>;
  getContactLidAndPhone?: (
    lids: string[]
  ) => Promise<Array<{ pn?: string | null }>>;
  getNumberId: (phone: string) => Promise<{ _serialized?: string } | null>;
  getChatById: (chatId: string) => Promise<unknown>;
  sendMessage: (
    jid: string,
    content: string | MessageMedia,
    options?: Record<string, unknown>
  ) => Promise<SentWhatsAppMessage | null>;
  initialize: () => Promise<void>;
};
type Message = WhatsAppMessageLike;
type MessageAck = number;
type MessageMedia = unknown;
type WhatsAppWebModule = {
  Client: new (...args: unknown[]) => WhatsAppClient;
  LocalAuth: new (...args: unknown[]) => unknown;
  MessageMedia: new (
    mimetype: string,
    data: string,
    filename?: string,
    filesize?: number
  ) => MessageMedia;
};

async function importWhatsAppWeb(): Promise<WhatsAppWebModule> {
  const dynamicImport = new Function(
    'specifier',
    'return import(specifier)'
  ) as (specifier: string) => Promise<unknown>;
  const importedModule = (await dynamicImport('whatsapp-web.js')) as {
    Client?: WhatsAppWebModule['Client'];
    LocalAuth?: WhatsAppWebModule['LocalAuth'];
    MessageMedia?: WhatsAppWebModule['MessageMedia'];
    default?: Partial<WhatsAppWebModule>;
  };

  // Handle different export patterns
  const Client =
    importedModule.Client ||
    importedModule.default?.Client ||
    (importedModule as unknown as WhatsAppWebModule['Client']);
  const LocalAuth =
    importedModule.LocalAuth ||
    importedModule.default?.LocalAuth ||
    class LocalAuth {};
  const MessageMedia =
    importedModule.MessageMedia || importedModule.default?.MessageMedia;

  if (!Client || !MessageMedia) {
    throw new Error('whatsapp-web.js exports are incomplete');
  }

  return {
    Client,
    LocalAuth,
    MessageMedia,
  };
}

async function runtimeImport<T>(specifier: string): Promise<T> {
  const dynamicImport = new Function(
    'specifier',
    'return import(specifier)'
  ) as (specifier: string) => Promise<T>;
  return dynamicImport(specifier);
}

const MEDIA_MIME_FALLBACK: Record<BaileysOutboundContentType, string> = {
  text: 'text/plain',
  template: 'text/plain',
  interactive: 'text/plain',
  image: 'image/jpeg',
  video: 'video/mp4',
  document: 'application/octet-stream',
  audio: 'audio/ogg',
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  pdf: 'application/pdf',
  csv: 'text/csv',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
};

const authDir = path.join(process.cwd(), 'whatsapp_auth');
const authSessionDir = path.join(authDir, 'session-wacrm');
const authLockfile = path.join(authSessionDir, 'lockfile');
const sessionContextFile = path.join(authDir, 'session-context.json');
const QR_TIMEOUT_MS = 180000;
const INIT_WAIT_MS = 45000;
const HEALTH_CHECK_MS = 30000;
const HEALTH_CHECK_TIMEOUT_MS = 5000;
const OUTBOUND_MIRROR_MS = 10000;
const RECONNECT_DELAYS_MS = [2000, 5000, 15000, 30000, 60000];
const execFileAsync = promisify(execFile);
let client: WhatsAppClient | null = null;
let currentQr: string | null = null;
let lastError: string | null = null;
let currentState: BaileysSessionStatus['state'] = 'idle';
let connectedAt: string | null = null;
let lastActivityAt: string | null = null;
let lastRestartAt: string | null = null;
let restartCount = 0;
let initPromise: Promise<void> | null = null;
let destroyPromise: Promise<void> | null = null;
let qrTimer: NodeJS.Timeout | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let watchdogTimer: NodeJS.Timeout | null = null;
let outboundMirrorTimer: NodeJS.Timeout | null = null;
let outboundMirrorPromise: Promise<void> | null = null;
let reconnectAttempts = 0;
let manualStopRequested = false;
let sessionContext: { accountId: string; userId: string } | null = null;
let bootstrapStarted = false;

type StartOptions = {
  accountId: string;
  userId: string;
  autoStart?: boolean;
  restoreOnly?: boolean;
};

type WhatsAppServiceApi = {
  bindSessionContext: typeof bindBaileysSessionContext;
  bootstrap: typeof bootstrapBaileysSessionFromSavedAuth;
  start: typeof startBaileysSession;
  getStatus: typeof getBaileysSessionStatus;
  syncRecent: typeof syncBaileysRecentMessages;
  syncHistory: typeof syncBaileysHistory;
  restart: typeof restartBaileysSession;
  stop: typeof stopBaileysSession;
  sendText: typeof sendTextViaBaileys;
  sendMessage: typeof sendMessageViaBaileys;
};

type WhatsAppServiceRegistry = {
  owner: symbol;
  api: WhatsAppServiceApi;
};

const moduleInstanceId = Symbol('wacrm-whatsapp-service');
const serviceProcess = process as NodeJS.Process & {
  __wacrmWhatsAppService?: WhatsAppServiceRegistry;
};

function existingService(): WhatsAppServiceApi | null {
  const registry = serviceProcess.__wacrmWhatsAppService;
  return registry && registry.owner !== moduleInstanceId ? registry.api : null;
}

export function bindBaileysSessionContext(
  accountId: string,
  userId: string
): void {
  const existing = existingService();
  if (existing) {
    existing.bindSessionContext(accountId, userId);
    return;
  }
  sessionContext = { accountId, userId };
  persistSessionContext(sessionContext).catch((error) => {
    console.error('[whatsapp-web.js] session context persist failed:', error);
  });
}

function hasSavedAuth(): boolean {
  return existsSync(authSessionDir);
}

async function persistSessionContext(ctx: {
  accountId: string;
  userId: string;
}) {
  await mkdir(authDir, { recursive: true });
  await writeFile(
    sessionContextFile,
    JSON.stringify({ ...ctx, updatedAt: new Date().toISOString() }, null, 2),
    'utf8'
  );
}

async function loadPersistedSessionContext(): Promise<{
  accountId: string;
  userId: string;
} | null> {
  try {
    const raw = await readFile(sessionContextFile, 'utf8');
    const parsed = JSON.parse(raw) as {
      accountId?: unknown;
      userId?: unknown;
    };
    if (
      typeof parsed.accountId === 'string' &&
      typeof parsed.userId === 'string'
    ) {
      return { accountId: parsed.accountId, userId: parsed.userId };
    }
  } catch {
    return null;
  }
  return null;
}

async function inferSingleAccountSessionContext(): Promise<{
  accountId: string;
  userId: string;
} | null> {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from('profiles')
      .select('user_id, account_id, account_role')
      .not('account_id', 'is', null)
      .limit(50);

    if (error || !data?.length) return null;

    const accountIds = Array.from(
      new Set(
        data
          .map((row) =>
            typeof row.account_id === 'string' ? row.account_id : null
          )
          .filter((value): value is string => Boolean(value))
      )
    );
    if (accountIds.length !== 1) return null;

    const owner =
      data.find((row) => row.account_role === 'owner') ?? data[0] ?? null;
    const userId =
      owner && typeof owner.user_id === 'string' ? owner.user_id : null;
    if (!userId) return null;

    return { accountId: accountIds[0], userId };
  } catch (error) {
    console.warn('[whatsapp-web.js] session context inference skipped:', error);
    return null;
  }
}

function clearQrTimer() {
  if (qrTimer) {
    clearTimeout(qrTimer);
    qrTimer = null;
  }
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function clearWatchdogTimer() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

function clearOutboundMirrorTimer() {
  if (outboundMirrorTimer) {
    clearInterval(outboundMirrorTimer);
    outboundMirrorTimer = null;
  }
}

function touchActivity() {
  lastActivityAt = new Date().toISOString();
}

function getStatus(): BaileysSessionStatus {
  const connected =
    currentState === 'connected' ||
    Boolean(client?.info?.wid || client?.info?.me?.user);
  if (connected) {
    currentState = 'connected';
    currentQr = null;
    connectedAt ??= new Date().toISOString();
  }

  return {
    connected,
    state: currentState,
    qr: currentQr,
    lastError,
    userJid: client?.info?.wid?._serialized ?? client?.info?.me?.user ?? null,
    connectedAt,
    connectedForSeconds:
      connected && connectedAt
        ? Math.max(0, Math.floor((Date.now() - Date.parse(connectedAt)) / 1000))
        : null,
    hasSavedAuth: hasSavedAuth(),
    isStarting: Boolean(initPromise) || currentState === 'starting',
    lastActivityAt,
    lastRestartAt,
    restartCount,
  };
}

function markConnected() {
  clearQrTimer();
  clearReconnectTimer();
  currentQr = null;
  currentState = 'connected';
  connectedAt ??= new Date().toISOString();
  touchActivity();
  lastError = null;
  reconnectAttempts = 0;
  ensureWatchdog();
  ensureOutboundMirror();
}

function markDisconnected(
  state: Exclude<BaileysSessionStatus['state'], 'connected'>,
  error: string | null = null
) {
  clearQrTimer();
  currentQr = null;
  currentState = state;
  connectedAt = null;
  clearOutboundMirrorTimer();
  touchActivity();
  lastError = error;
}

export function bootstrapBaileysSessionFromSavedAuth(): void {
  const existing = existingService();
  if (existing) {
    existing.bootstrap();
    return;
  }
  if (bootstrapStarted || client || initPromise || !hasSavedAuth()) {
    return;
  }
  bootstrapStarted = true;

  loadPersistedSessionContext()
    .then(async (ctx) => ctx ?? inferSingleAccountSessionContext())
    .then((ctx) => {
      if (!ctx) {
        console.warn(
          '[whatsapp-web.js] saved auth found, but no session context file exists yet.'
        );
        return;
      }
      persistSessionContext(ctx).catch(() => undefined);
      sessionContext = ctx;
      return startBaileysSession({
        accountId: ctx.accountId,
        userId: ctx.userId,
        autoStart: true,
        restoreOnly: true,
      });
    })
    .catch((error) => {
      console.error('[whatsapp-web.js] bootstrap restore failed:', error);
      bootstrapStarted = false;
    });
}

function mapWaState(
  value: string | null | undefined
): BaileysSessionStatus['state'] {
  if (value === 'CONNECTED') return 'connected';
  if (value === 'PAIRING' || value === 'OPENING' || value === 'UNLAUNCHED') {
    return 'starting';
  }
  if (value === 'UNPAIRED' || value === 'UNPAIRED_IDLE') return 'qr';
  if (value === 'TIMEOUT') return 'disconnected';
  if (
    value === 'CONFLICT' ||
    value === 'DEPRECATED_VERSION' ||
    value === 'PROXYBLOCK' ||
    value === 'SMB_TOS_BLOCK' ||
    value === 'TOS_BLOCK'
  ) {
    return 'error';
  }
  return currentState;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function destroyClient(reason: string): Promise<void> {
  if (destroyPromise) {
    await destroyPromise;
    return;
  }
  const activeClient = client;
  client = null;
  if (!activeClient) return;

  destroyPromise = activeClient
    .destroy()
    .catch((error: unknown) => {
      console.error('[whatsapp-web.js] client destroy failed:', {
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      destroyPromise = null;
    });
  await destroyPromise;
}

async function recoverOrphanedBrowserProfile(): Promise<void> {
  if (process.platform !== 'win32') return;

  const script = `
$authDir = $env:WACRM_AUTH_DIR
$workspace = $env:WACRM_WORKSPACE
$ownerPid = [int]$env:WACRM_OWNER_PID
$browsers = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'chrome.exe' -and
  $_.CommandLine -like "*$authDir*" -and
  $_.CommandLine -notlike '*--type=*'
}
foreach ($browser in $browsers) {
  $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($browser.ParentProcessId)" -ErrorAction SilentlyContinue
  $ownedByCurrentProcess = $browser.ParentProcessId -eq $ownerPid
  $ownedByWorkspaceServer = $parent -and $parent.Name -eq 'node.exe' -and $parent.CommandLine -like "*$workspace*"
  if (-not $ownedByCurrentProcess -and -not $ownedByWorkspaceServer) {
    Stop-Process -Id $browser.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Output $browser.ProcessId
  }
}
`;

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        env: {
          ...process.env,
          WACRM_AUTH_DIR: authSessionDir,
          WACRM_WORKSPACE: process.cwd(),
          WACRM_OWNER_PID: String(process.pid),
        },
        timeout: 8000,
        windowsHide: true,
      }
    );
    const recoveredPids = stdout
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (recoveredPids.length > 0) {
      console.warn('[whatsapp-web.js] recovered orphaned Chromium profile:', {
        processIds: recoveredPids,
      });
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  } catch (error) {
    console.warn('[whatsapp-web.js] orphaned browser check skipped:', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function ensureWatchdog() {
  if (watchdogTimer) return;

  watchdogTimer = setInterval(() => {
    runHealthCheck('watchdog').catch((error) => {
      console.error('[whatsapp-web.js] watchdog failed:', error);
    });
  }, HEALTH_CHECK_MS);
}

function ensureOutboundMirror() {
  if (outboundMirrorTimer) return;

  const run = () => {
    if (outboundMirrorPromise || !client || !getStatus().connected) return;
    outboundMirrorPromise = syncRecentOutboundFromWebStore()
      .then(() => undefined)
      .catch((error) => {
        console.error('[whatsapp-web.js] outbound mirror sync failed:', error);
      })
      .finally(() => {
        outboundMirrorPromise = null;
      });
  };

  setTimeout(run, 2000);
  outboundMirrorTimer = setInterval(run, OUTBOUND_MIRROR_MS);
}

function scheduleReconnect(reason: string | null = null) {
  if (manualStopRequested || reconnectTimer || !sessionContext) return;
  if (!hasSavedAuth()) return;

  const delay =
    RECONNECT_DELAYS_MS[
      Math.min(reconnectAttempts, RECONNECT_DELAYS_MS.length - 1)
    ];
  reconnectAttempts += 1;

  console.warn('[whatsapp-web.js] scheduling QR session reconnect:', {
    delay,
    reason,
    attempt: reconnectAttempts,
  });

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    const ctx = sessionContext;
    if (!ctx || manualStopRequested) return;
    startBaileysSession({
      accountId: ctx.accountId,
      userId: ctx.userId,
      autoStart: true,
      restoreOnly: true,
    }).catch((error) => {
      console.error('[whatsapp-web.js] scheduled reconnect failed:', error);
      scheduleReconnect(error instanceof Error ? error.message : String(error));
    });
  }, delay);
}

async function runHealthCheck(source: 'status' | 'watchdog') {
  if (!client || initPromise) {
    if (!client && source === 'watchdog') clearWatchdogTimer();
    return getStatus();
  }

  try {
    const state = await withTimeout(
      client.getState(),
      HEALTH_CHECK_TIMEOUT_MS,
      'WhatsApp Web health check timed out.'
    );
    const nextState = mapWaState(String(state));

    if (nextState === 'connected') {
      markConnected();
      return getStatus();
    }

    if (nextState === 'starting' || nextState === 'qr') {
      currentState = nextState;
      touchActivity();
      return getStatus();
    }

    const message = `WhatsApp Web state is ${state}.`;
    markDisconnected(nextState, message);
    await destroyClient('health-check');
    scheduleReconnect(message);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    markDisconnected('disconnected', message);
    await destroyClient('health-check-error');
    scheduleReconnect(message);
  }

  return getStatus();
}

async function resolveRealCustomerPhone(
  jid: string,
  contactJid?: string | null
): Promise<string | null> {
  const directPhone = phoneFromWhatsAppJid(jid, contactJid);
  if (directPhone) return directPhone;
  if (!jid.endsWith('@lid') || !client?.getContactLidAndPhone) return null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const mappings = await client.getContactLidAndPhone([jid]).catch(() => []);
    const mappedPhone = phoneFromWhatsAppJid(jid, mappings[0]?.pn);
    if (mappedPhone) return mappedPhone;
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  return null;
}

function phoneToJid(phone: string): string {
  return `${sanitizePhoneForMeta(phone)}@c.us`;
}

function extractCustomerJidFromMessageId(
  messageId: string | null
): string | null {
  if (!messageId) return null;
  const match = /(?:^|_)([^_]+@(c\.us|lid))(?:_|$)/.exec(messageId);
  const jid = match?.[1] ?? null;
  return jid && isCustomerChat(jid) ? jid : null;
}

async function getConversationJidCandidates(
  db: SupabaseClient,
  conversationId: string
): Promise<string[]> {
  const { data } = await db
    .from('messages')
    .select('message_id')
    .eq('conversation_id', conversationId)
    .not('message_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  const candidates: string[] = [];
  const push = (jid: string | null) => {
    if (jid && isCustomerChat(jid) && !candidates.includes(jid)) {
      candidates.push(jid);
    }
  };

  for (const row of data ?? []) {
    push(extractCustomerJidFromMessageId(String(row.message_id ?? '')));
  }

  return candidates;
}

function buildSendJidCandidates(rawPhone: string): string[] {
  const candidates: string[] = [];
  const push = (jid: string) => {
    if (isCustomerChat(jid) && !candidates.includes(jid)) candidates.push(jid);
  };

  if (rawPhone.includes('@')) {
    push(rawPhone);
  }

  const phone = sanitizePhoneForMeta(rawPhone);
  if (phone) {
    push(phoneToJid(phone));
    push(`${phone}@lid`);
  }

  return candidates;
}

async function resolveSendJidCandidates(
  rawPhone: string,
  knownJids: string[] = []
): Promise<string[]> {
  const phone = sanitizePhoneForMeta(rawPhone);
  const registeredNumber =
    phone && client ? await client.getNumberId(phone).catch(() => null) : null;
  const lidPhoneMappings =
    phone && client?.getContactLidAndPhone
      ? await client.getContactLidAndPhone([`${phone}@c.us`]).catch(() => [])
      : [];
  const pageCandidates =
    phone && client?.pupPage
      ? await client.pupPage
          .evaluate((targetPhone: string) => {
            const collections = window.require('WAWebCollections');
            const apiContact = window.require('WAWebApiContact');
            const chats = collections.Chat.getModelsArray();
            const candidates: string[] = [];
            const push = (jid: string | undefined | null) => {
              if (jid && !candidates.includes(jid)) candidates.push(jid);
            };

            for (const chat of chats) {
              const jid = chat?.id?._serialized ?? '';
              if (!jid) continue;

              try {
                const [user, server] = jid.split('@');
                if (
                  user === targetPhone &&
                  (server === 'lid' || server === 'c.us')
                ) {
                  push(jid);
                }
              } catch {
                // Ignore malformed chat ids from WA internals.
              }

              try {
                const phoneWid = apiContact.getPhoneNumber(chat.id);
                const phoneJid = phoneWid?._serialized;
                if (phoneJid?.split('@')[0] === targetPhone) {
                  push(jid);
                  push(phoneJid);
                }
              } catch {
                // Some chat models do not expose phone mapping.
              }

              try {
                const lidWid = apiContact.getCurrentLid(chat.id);
                const lidJid = lidWid?._serialized;
                if (lidJid && jid.split('@')[0] === targetPhone) {
                  push(lidJid);
                }
              } catch {
                // Some phone ids do not have a known LID yet.
              }
            }

            return candidates;
          }, phone)
          .catch(() => [])
      : [];

  const candidates: string[] = [];
  const push = (jid: string) => {
    if (isCustomerChat(jid) && !candidates.includes(jid)) candidates.push(jid);
  };
  knownJids.forEach(push);
  if (registeredNumber?._serialized) push(registeredNumber._serialized);
  for (const mapping of lidPhoneMappings as Array<{
    lid?: string | null;
    pn?: string | null;
  }>) {
    if (mapping.lid) push(mapping.lid);
    if (mapping.pn) push(mapping.pn);
  }
  (pageCandidates as string[]).forEach(push);

  if (rawPhone.includes('@')) {
    buildSendJidCandidates(rawPhone).forEach(push);
  } else if (phone && isValidE164(phone)) {
    // getNumberId can temporarily return null for valid contacts while the
    // WhatsApp Web LID/phone cache is warming. Keep discovered JIDs first, but
    // always let sendMessage try the canonical phone JID before declaring the
    // recipient unavailable.
    buildSendJidCandidates(rawPhone).forEach(push);
  }

  return candidates;
}

function filenameFromContentDisposition(value: string | null): string | null {
  if (!value) return null;
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return utf8Match[1].trim();
    }
  }

  const quotedMatch = /filename="([^"]+)"/i.exec(value);
  if (quotedMatch?.[1]) return quotedMatch[1].trim();

  const plainMatch = /filename=([^;]+)/i.exec(value);
  return plainMatch?.[1]?.trim() ?? null;
}

function filenameFromUrl(mediaUrl: string): string | null {
  try {
    const parsed = new URL(mediaUrl);
    const name = parsed.pathname.split('/').filter(Boolean).pop();
    return name ? decodeURIComponent(name) : null;
  } catch {
    return null;
  }
}

function mimeFromFilename(
  filename: string | null | undefined,
  contentType: BaileysOutboundContentType
) {
  const ext = filename?.split('.').pop()?.toLowerCase();
  return (ext && MIME_BY_EXTENSION[ext]) || MEDIA_MIME_FALLBACK[contentType];
}

function normalizeMimeType(
  value: string | null,
  contentType: BaileysOutboundContentType,
  filename?: string | null
) {
  const mime = value?.split(';')[0]?.trim().toLowerCase();
  return mime || mimeFromFilename(filename, contentType);
}

async function createMessageMediaFromUrl(
  mediaUrl: string,
  contentType: BaileysOutboundContentType,
  filename?: string | null
): Promise<MessageMedia> {
  const { MessageMedia } = await importWhatsAppWeb();
  const response = await fetch(mediaUrl, {
    headers: { accept: 'image/*, video/*, audio/*, application/*, text/*' },
  });

  if (!response.ok) {
    throw new Error(`Could not download media (${response.status}).`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error('Downloaded media is empty.');
  }

  const resolvedFilename =
    filename ||
    filenameFromContentDisposition(
      response.headers.get('content-disposition')
    ) ||
    filenameFromUrl(mediaUrl) ||
    'file';
  const mimeType = normalizeMimeType(
    response.headers.get('content-type'),
    contentType,
    resolvedFilename
  );

  return new MessageMedia(
    mimeType,
    bytes.toString('base64'),
    resolvedFilename,
    bytes.byteLength
  );
}

async function findRecentSentMessageInWebStore(
  jid: string,
  text: string
): Promise<SentWhatsAppMessage | null> {
  if (!client?.pupPage) return null;

  const serialized = await client.pupPage
    .evaluate(
      async ({
        targetJid,
        targetText,
      }: {
        targetJid: string;
        targetText: string;
      }) => {
        const sleep = (ms: number) =>
          new Promise((resolve) => setTimeout(resolve, ms));

        const normalizedText = targetText.trim();
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const msgCollection = window.require('WAWebCollections').Msg;
          const messages = (msgCollection.getModelsArray?.() ??
            []) as WebStoreMessageModel[];
          const now = Math.floor(Date.now() / 1000);
          const match = messages
            .filter((message: WebStoreMessageModel) => {
              const model = message?.serialize?.() ?? message;
              const remote =
                typeof model?.id?.remote === 'string'
                  ? model.id.remote
                  : model?.id?.remote?._serialized;
              const chatId =
                remote ||
                model?.to?._serialized ||
                model?.from?._serialized ||
                message?.chat?.id?._serialized;
              const body = String(model?.body ?? model?.caption ?? '').trim();
              const sentRecently =
                typeof model?.t === 'number' ? now - model.t <= 120 : true;

              return (
                Boolean(model?.id?.fromMe || model?.fromMe) &&
                chatId === targetJid &&
                sentRecently &&
                (!normalizedText || body === normalizedText)
              );
            })
            .sort((a: WebStoreMessageModel, b: WebStoreMessageModel) => {
              const aModel = a?.serialize?.() ?? a;
              const bModel = b?.serialize?.() ?? b;
              return Number(bModel?.t ?? 0) - Number(aModel?.t ?? 0);
            })[0];

          if (match) {
            return (
              window as unknown as Window & {
                WWebJS: { getMessageModel: (message: unknown) => unknown };
              }
            ).WWebJS.getMessageModel(match);
          }
          await sleep(500);
        }

        return null;
      },
      { targetJid: jid, targetText: text }
    )
    .catch(() => null);

  return serialized as SentWhatsAppMessage | null;
}

function isCustomerChat(jid: string): boolean {
  return (
    (jid.endsWith('@c.us') || jid.endsWith('@lid')) &&
    !jid.includes('status@') &&
    !jid.endsWith('@g.us') &&
    !jid.endsWith('@newsletter')
  );
}

async function findOrCreateContact(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  phone: string,
  name: string | null
) {
  const existing = await findExistingContact(db, accountId, phone);
  if (existing) {
    const existingName = String(existing.name ?? '').trim();
    const hasPlaceholderName =
      !existingName || normalizePhone(existingName) === normalizePhone(phone);
    if (name && hasPlaceholderName && name !== existing.name) {
      await db
        .from('contacts')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    }
    return existing;
  }

  const { data, error } = await db
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: userId,
      phone,
      name: name || phone,
    })
    .select('*')
    .single();

  if (error || !data) {
    if (isUniqueViolation(error)) {
      return findExistingContact(db, accountId, phone);
    }
    console.error('[whatsapp-web.js] contact create failed:', error);
    return null;
  }

  return data;
}

async function findOrCreateConversation(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  contactId: string
) {
  const { data: existing, error: findError } = await db
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .limit(1);

  if (findError) {
    console.error('[whatsapp-web.js] conversation lookup failed:', findError);
    return null;
  }

  if (existing && existing.length > 0) return existing[0];

  const { data, error } = await db
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: userId,
      contact_id: contactId,
    })
    .select('*')
    .single();

  if (error || !data) {
    if (isUniqueViolation(error)) {
      const { data: raced } = await db
        .from('conversations')
        .select('*')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: true })
        .limit(1);
      return raced?.[0] ?? null;
    }
    console.error('[whatsapp-web.js] conversation create failed:', error);
    return null;
  }

  return data;
}

async function runQrAutomations(input: {
  accountId: string;
  contactId: string;
  conversationId: string;
  messageText: string;
  isFirstInboundMessage: boolean;
  flowConsumed: boolean;
}) {
  const { runAutomationsForTrigger } = await runtimeImport<
    typeof import('@/lib/automations/engine')
  >('@/lib/automations/engine');
  const triggers: AutomationTriggerType[] = input.flowConsumed
    ? []
    : ['new_message_received', 'keyword_match'];
  if (input.isFirstInboundMessage) triggers.unshift('first_inbound_message');

  await Promise.all(
    triggers.map((triggerType) =>
      runAutomationsForTrigger({
        accountId: input.accountId,
        triggerType,
        contactId: input.contactId,
        context: {
          conversation_id: input.conversationId,
          message_text: input.messageText,
        },
      })
    )
  );
}

async function runQrFlows(input: {
  accountId: string;
  userId: string;
  contactId: string;
  conversationId: string;
  messageText: string;
  messageId: string;
  isFirstInboundMessage: boolean;
}): Promise<boolean> {
  const { dispatchInboundToFlows } =
    await runtimeImport<typeof import('@/lib/flows/engine')>(
      '@/lib/flows/engine'
    );
  const result = await dispatchInboundToFlows({
    accountId: input.accountId,
    userId: input.userId,
    contactId: input.contactId,
    conversationId: input.conversationId,
    isFirstInboundMessage: input.isFirstInboundMessage,
    message: {
      kind: 'text',
      text: input.messageText,
      meta_message_id: input.messageId,
    },
  });
  return result.consumed;
}

function messageIdFromQrMessage(message: WhatsAppMessageLike): string | null {
  return message.id?._serialized ?? message.id?.id ?? null;
}

function qrAckToStatus(ack: MessageAck | number): QrDeliveryStatus | null {
  if (ack < 0) return 'failed';
  if (ack >= 3) return 'read';
  if (ack === 2) return 'delivered';
  if (ack === 1) return 'sent';
  return null;
}

function deliveryLevel(status: string): number {
  if (status === 'pending' || status === 'sending') return 0;
  if (status === 'sent') return 1;
  if (status === 'delivered') return 2;
  if (status === 'read') return 3;
  if (status === 'replied') return 4;
  return -1;
}

function canApplyQrDeliveryStatus(
  current: string,
  incoming: QrDeliveryStatus
): boolean {
  if (incoming === 'failed') {
    return current === 'pending' || current === 'sending' || current === 'sent';
  }
  if (current === 'failed') return false;

  const currentLevel = deliveryLevel(current);
  const incomingLevel = deliveryLevel(incoming);
  if (incomingLevel < 0) return false;
  if (currentLevel < 0) return true;
  return incomingLevel > currentLevel;
}

async function handleQrMessageAck(
  message: WhatsAppMessageLike,
  ack: MessageAck | number
) {
  if (message.fromMe === false) return;

  const messageId = messageIdFromQrMessage(message);
  const status = qrAckToStatus(ack);
  if (!messageId || !status) return;

  const db = supabaseAdmin();
  const now = new Date().toISOString();

  const { data: messageRows, error: msgFetchError } = await db
    .from('messages')
    .select('id, status')
    .eq('message_id', messageId);

  if (msgFetchError) {
    console.error(
      '[whatsapp-web.js] ack message lookup failed:',
      msgFetchError
    );
  } else {
    for (const row of messageRows ?? []) {
      if (!canApplyQrDeliveryStatus(String(row.status), status)) continue;
      const { error } = await db
        .from('messages')
        .update({ status })
        .eq('id', row.id);
      if (error) {
        console.error('[whatsapp-web.js] ack message update failed:', error);
      }
    }
  }

  const { data: recipient, error: recFetchError } = await db
    .from('broadcast_recipients')
    .select('id, status, sent_at, delivered_at, read_at')
    .eq('whatsapp_message_id', messageId)
    .maybeSingle();

  if (recFetchError) {
    console.error(
      '[whatsapp-web.js] ack recipient lookup failed:',
      recFetchError
    );
    return;
  }

  if (!recipient || !canApplyQrDeliveryStatus(recipient.status, status)) {
    return;
  }

  const update: Record<string, unknown> = { status };
  if (status === 'failed') {
    update.error_message = 'WhatsApp reported delivery failure.';
  } else {
    update.error_message = null;
  }
  if (!recipient.sent_at) update.sent_at = now;
  if (
    (status === 'delivered' || status === 'read') &&
    !recipient.delivered_at
  ) {
    update.delivered_at = now;
  }
  if (status === 'read' && !recipient.read_at) {
    update.read_at = now;
  }

  const { error: recUpdateError } = await db
    .from('broadcast_recipients')
    .update(update)
    .eq('id', recipient.id);

  if (recUpdateError) {
    console.error(
      '[whatsapp-web.js] ack recipient update failed:',
      recUpdateError
    );
  }
}

async function flagQrBroadcastReplyIfAny(accountId: string, contactId: string) {
  try {
    const db = supabaseAdmin();
    const { data: recs, error } = await db
      .from('broadcast_recipients')
      .select('id, status, broadcast_id, broadcasts!inner(account_id)')
      .eq('contact_id', contactId)
      .eq('broadcasts.account_id', accountId)
      .in('status', ['sent', 'delivered', 'read'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !recs || recs.length === 0) return;

    const { error: updateError } = await db
      .from('broadcast_recipients')
      .update({ status: 'replied', replied_at: new Date().toISOString() })
      .eq('id', recs[0].id);

    if (updateError) {
      console.error(
        '[whatsapp-web.js] broadcast reply update failed:',
        updateError
      );
    }
  } catch (error) {
    console.error('[whatsapp-web.js] broadcast reply lookup failed:', error);
  }
}

async function persistMessage(
  message: WhatsAppMessageLike,
  options: {
    includeOutbound?: boolean;
    triggerAutomations?: boolean;
    skipExistingCheck?: boolean;
  } = {}
) {
  const ctx = sessionContext;
  if (!ctx) return false;
  if (message.fromMe && !options.includeOutbound) return false;

  const chatJid = message.fromMe ? message.to : message.from;
  if (!chatJid || !isCustomerChat(chatJid)) return false;

  const db = supabaseAdmin();
  const messageId = messageIdFromQrMessage(message);
  if (messageId && !options.skipExistingCheck) {
    const { data: existing } = await db
      .from('messages')
      .select('id')
      .eq('message_id', messageId)
      .maybeSingle();
    if (existing) {
      if (message.fromMe && typeof message.ack === 'number') {
        await handleQrMessageAck(message, message.ack);
      }
      return false;
    }
  }

  let displayName: string | null = null;
  let contactJid: string | null = null;
  try {
    const contact = message.getContact ? await message.getContact() : null;
    displayName =
      contact?.pushname || contact?.name || contact?.shortName || null;
    contactJid = contact?.id?._serialized ?? null;
  } catch {
    displayName = null;
  }

  const phone = await resolveRealCustomerPhone(chatJid, contactJid);
  if (!phone) {
    console.warn(
      '[whatsapp-web.js] message skipped: WhatsApp did not resolve a real phone number:',
      {
        from: message.from,
        to: message.to,
        type: message.type,
      }
    );
    return false;
  }

  const contact = await findOrCreateContact(
    db,
    ctx.accountId,
    ctx.userId,
    phone,
    displayName
  );
  if (!contact) return false;

  const conversation = await findOrCreateConversation(
    db,
    ctx.accountId,
    ctx.userId,
    contact.id
  );
  if (!conversation) return false;

  const rawType = typeof message.type === 'string' ? message.type : 'text';
  const contentType =
    rawType === 'chat'
      ? 'text'
      : ['text', 'image', 'document', 'audio', 'video', 'location'].includes(
            rawType
          )
        ? rawType
        : 'text';
  const contentText =
    typeof message.body === 'string' && message.body.trim()
      ? message.body
      : rawType === 'chat'
        ? null
        : `[${rawType}]`;
  const createdAt =
    typeof message.timestamp === 'number'
      ? new Date(message.timestamp * 1000).toISOString()
      : new Date().toISOString();
  const shouldTriggerAutomations =
    !message.fromMe && options.triggerAutomations === true;
  const initialStatus = message.fromMe
    ? (qrAckToStatus(message.ack ?? 0) ?? 'sent')
    : 'delivered';
  let isFirstInboundMessage = false;

  if (shouldTriggerAutomations) {
    const { count } = await db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversation.id)
      .eq('sender_type', 'customer');
    isFirstInboundMessage = (count ?? 0) === 0;
  }

  const { error: msgError } = await db.from('messages').insert({
    conversation_id: conversation.id,
    sender_type: message.fromMe ? 'agent' : 'customer',
    content_type: contentType,
    content_text: contentText,
    message_id: messageId,
    dedupe_key: messageDedupeKey(conversation.id, messageId),
    status: initialStatus,
    created_at: createdAt,
  });

  if (msgError) {
    console.error('[whatsapp-web.js] message insert failed:', msgError);
    return false;
  }

  if (message.fromMe && typeof message.ack === 'number') {
    await handleQrMessageAck(message, message.ack);
  }

  const update: Record<string, unknown> = {
    last_message_text: contentText || `[${rawType}]`,
    last_message_at: createdAt,
    updated_at: new Date().toISOString(),
  };
  if (!message.fromMe) {
    update.unread_count = (conversation.unread_count || 0) + 1;
  }

  await db.from('conversations').update(update).eq('id', conversation.id);

  if (!message.fromMe) {
    flagQrBroadcastReplyIfAny(ctx.accountId, contact.id).catch((error) => {
      console.error('[whatsapp-web.js] broadcast reply flag failed:', error);
    });

    if (contentText?.trim()) {
      handleAppointmentConfirmationReply({
        db,
        accountId: ctx.accountId,
        contactId: contact.id,
        conversationId: conversation.id,
        messageText: contentText,
        sourceMessageId: messageId,
      }).catch((error) => {
        console.error('[whatsapp-web.js] agenda confirmation failed:', error);
      });
    }
  }

  console.log('[whatsapp-web.js] message persisted:', {
    conversationId: conversation.id,
    contactId: contact.id,
    messageId,
    fromMe: message.fromMe,
  });

  if (shouldTriggerAutomations) {
    const messageText = contentText ?? '';
    const flowConsumed = await runQrFlows({
      accountId: ctx.accountId,
      userId: ctx.userId,
      contactId: contact.id,
      conversationId: conversation.id,
      messageText,
      messageId: messageId ?? `qr:${conversation.id}:${createdAt}`,
      isFirstInboundMessage,
    }).catch((error) => {
      console.error('[whatsapp-web.js] flow dispatch failed:', error);
      return false;
    });

    runQrAutomations({
      accountId: ctx.accountId,
      contactId: contact.id,
      conversationId: conversation.id,
      messageText,
      isFirstInboundMessage,
      flowConsumed,
    }).catch((error) => {
      console.error('[whatsapp-web.js] automation dispatch failed:', error);
    });
  }

  return true;
}

async function persistIncomingMessage(message: WhatsAppMessageLike) {
  await persistMessage(message, {
    includeOutbound: true,
    triggerAutomations: true,
  });
}

async function syncHistory(
  options: { chatLimit?: number; messageLimit?: number } = {}
): Promise<BaileysSyncResult> {
  const ctx = sessionContext;
  if (!ctx || !client || !getStatus().connected) {
    throw new Error('WhatsApp QR session is not connected.');
  }

  const chatLimit = Math.max(1, Math.min(options.chatLimit ?? 50, 500));
  const messageLimit = Math.max(1, Math.min(options.messageLimit ?? 25, 200));
  const result: BaileysSyncResult = {
    chatsScanned: 0,
    messagesScanned: 0,
    messagesPersisted: 0,
  };

  const chatIds = await getCustomerChatIds(chatLimit);

  for (const chatId of chatIds) {
    result.chatsScanned += 1;
    try {
      const messages = await fetchChatMessages(chatId, messageLimit);
      for (const message of messages) {
        result.messagesScanned += 1;
        if (await persistMessage(message, { includeOutbound: true })) {
          result.messagesPersisted += 1;
        }
      }
    } catch (error) {
      console.warn('[whatsapp-web.js] chat sync skipped:', {
        chatId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

async function fetchChatMessages(
  chatId: string,
  limit: number
): Promise<WhatsAppMessageLike[]> {
  const activeClient = client;
  if (!activeClient) return [];

  try {
    const chat = await withTimeout(
      activeClient.getChatById(chatId),
      8000,
      `Timed out while opening WhatsApp chat ${chatId}.`
    );
    if (!chat) return [];
    const chatWithMessages = chat as {
      fetchMessages: (input: {
        limit: number;
      }) => Promise<WhatsAppMessageLike[]>;
    };
    return await withTimeout(
      chatWithMessages.fetchMessages({ limit }),
      10000,
      `Timed out while fetching WhatsApp messages for ${chatId}.`
    );
  } catch (error) {
    console.warn(
      '[whatsapp-web.js] wrapper chat sync failed, using page store:',
      {
        chatId,
        error: error instanceof Error ? error.message : String(error),
      }
    );
  }

  if (!activeClient.pupPage) return [];

  const rawMessages = await activeClient.pupPage.evaluate(
    ({
      targetChatId,
      messageLimit,
    }: {
      targetChatId: string;
      messageLimit: number;
    }) => {
      const collections = window.require('WAWebCollections');
      const chats = collections.Chat.getModelsArray() as WebStoreChatModel[];
      const chat = chats.find(
        (item: WebStoreChatModel) => item?.id?._serialized === targetChatId
      );
      if (!chat) return [];

      const msgCollection = chat.msgs;
      const models =
        typeof msgCollection?.getModelsArray === 'function'
          ? msgCollection.getModelsArray()
          : Array.isArray(msgCollection?._models)
            ? msgCollection._models
            : Array.isArray(msgCollection?.models)
              ? msgCollection.models
              : [];

      return models
        .slice(-messageLimit)
        .map((message: WebStoreMessageModel) => ({
          id: {
            _serialized:
              message?.id?._serialized ?? message?.__x_id?._serialized ?? null,
            id: message?.id?.id ?? message?.__x_id?.id ?? null,
          },
          from:
            message?.from?._serialized ??
            message?.__x_from?._serialized ??
            targetChatId,
          to:
            message?.to?._serialized ??
            message?.__x_to?._serialized ??
            targetChatId,
          fromMe: Boolean(message?.fromMe ?? message?.__x_isSentByMe),
          body: message?.body ?? message?.caption ?? '',
          type: message?.type ?? 'chat',
          timestamp: message?.t ?? message?.timestamp,
          ack: message?.ack ?? message?.__x_ack ?? null,
        }));
    },
    { targetChatId: chatId, messageLimit: limit }
  );

  return (rawMessages as WhatsAppMessageLike[]).filter((message) => {
    const jid = message.fromMe ? message.to : message.from;
    return Boolean(jid && isCustomerChat(jid));
  });
}

async function syncRecentOutboundFromWebStore(): Promise<number> {
  const activeClient = client;
  const ctx = sessionContext;
  if (!activeClient?.pupPage || !ctx || !getStatus().connected) return 0;

  const rawMessages = await withTimeout(
    activeClient.pupPage.evaluate(() => {
      const collections = window.require('WAWebCollections');
      const chats = collections.Chat.getModelsArray() as WebStoreChatModel[];
      const outbound: Array<{
        id: { _serialized: string | null; id: string | null };
        from: string;
        to: string;
        fromMe: true;
        body: string;
        type: string;
        timestamp: number | undefined;
        ack: number | null;
      }> = [];

      for (const chat of chats) {
        const chatJid = chat?.id?._serialized ?? '';
        if (!chatJid.endsWith('@c.us') && !chatJid.endsWith('@lid')) continue;

        const collection = chat.msgs;
        const models =
          typeof collection?.getModelsArray === 'function'
            ? collection.getModelsArray()
            : Array.isArray(collection?._models)
              ? collection._models
              : Array.isArray(collection?.models)
                ? collection.models
                : [];

        for (const message of models.slice(-15)) {
          const fromMe = Boolean(
            message?.id?.fromMe ??
            message?.__x_id?.fromMe ??
            message?.fromMe ??
            message?.__x_isSentByMe
          );
          if (!fromMe) continue;

          outbound.push({
            id: {
              _serialized:
                message?.id?._serialized ??
                message?.__x_id?._serialized ??
                null,
              id: message?.id?.id ?? message?.__x_id?.id ?? null,
            },
            from:
              message?.from?._serialized ??
              message?.__x_from?._serialized ??
              '',
            to:
              message?.to?._serialized ??
              message?.__x_to?._serialized ??
              chatJid,
            fromMe: true,
            body: message?.body ?? message?.caption ?? '',
            type: message?.type ?? 'chat',
            timestamp: message?.t ?? message?.timestamp ?? undefined,
            ack: message?.ack ?? message?.__x_ack ?? null,
          });
        }
      }

      return outbound
        .sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0))
        .slice(0, 200);
    }),
    8000,
    'Timed out while reading outbound messages from WhatsApp Web.'
  );

  const messages = (rawMessages as WhatsAppMessageLike[]).filter((message) =>
    Boolean(message.fromMe && message.to && isCustomerChat(message.to))
  );
  const messageIds = Array.from(
    new Set(
      messages
        .map(messageIdFromQrMessage)
        .filter((value): value is string => Boolean(value))
    )
  );
  if (messageIds.length === 0) return 0;

  const db = supabaseAdmin();
  const { data: existingRows, error: existingError } = await db
    .from('messages')
    .select('message_id')
    .in('message_id', messageIds);
  if (existingError) throw existingError;

  const existingIds = new Set(
    (existingRows ?? [])
      .map((row) => row.message_id)
      .filter((value): value is string => typeof value === 'string')
  );
  let persisted = 0;

  for (const message of messages.sort(
    (left, right) => (left.timestamp ?? 0) - (right.timestamp ?? 0)
  )) {
    const messageId = messageIdFromQrMessage(message);
    if (!messageId || existingIds.has(messageId)) continue;
    if (
      await persistMessage(message, {
        includeOutbound: true,
        skipExistingCheck: true,
      })
    ) {
      existingIds.add(messageId);
      persisted += 1;
    }
  }

  if (persisted > 0) {
    console.log('[whatsapp-web.js] linked-device outbound sync complete:', {
      accountId: ctx.accountId,
      scanned: messages.length,
      persisted,
    });
  }
  return persisted;
}

async function getCustomerChatIds(limit: number): Promise<string[]> {
  if (!client?.pupPage) return [];

  const ids = await client.pupPage.evaluate(() => {
    const collections = window.require('WAWebCollections');
    const chats = collections.Chat.getModelsArray();
    return chats
      .map((chat: WebStoreChatModel) => chat?.id?._serialized ?? '')
      .filter(Boolean);
  });

  return (ids as string[]).filter(isCustomerChat).slice(0, limit);
}

async function buildClient() {
  const { Client, LocalAuth } = await importWhatsAppWeb();

  await recoverOrphanedBrowserProfile();

  // Chromium can leave this behind after a dev-server crash/restart.
  // LocalAuth survives; only the stale browser-profile lock is removed.
  if (!client) {
    await rm(authLockfile, { force: true }).catch(() => undefined);
  }

  const instance = new Client({
    authStrategy: new LocalAuth({
      dataPath: authDir,
      clientId: 'wacrm',
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    },
    takeoverOnConflict: true,
  });

  instance.on('qr', (qr: string) => {
    clearQrTimer();
    currentQr = qr;
    currentState = 'qr';
    connectedAt = null;
    touchActivity();
    lastError = null;
    console.log('[whatsapp-web.js] fresh QR generated.');
    qrTimer = setTimeout(() => {
      if (currentState === 'qr') {
        markDisconnected(
          'disconnected',
          'QR timed out. The system will generate a fresh QR automatically.'
        );
        scheduleReconnect('QR timed out.');
      }
    }, QR_TIMEOUT_MS);
  });

  instance.on('ready', () => {
    markConnected();
    console.log('[whatsapp-web.js] session ready:', {
      jid: instance.info?.wid?._serialized ?? instance.info?.me?.user ?? null,
    });
    setTimeout(() => {
      if (client !== instance || !getStatus().connected) return;
      syncHistory({ chatLimit: 100, messageLimit: 50 })
        .then((result) => {
          console.log(
            '[whatsapp-web.js] initial real-message sync complete:',
            result
          );
        })
        .catch((error) => {
          console.error(
            '[whatsapp-web.js] initial message sync failed:',
            error
          );
        });
    }, 1500);
  });

  instance.on('message', (message: Message) => {
    touchActivity();
    console.log('[whatsapp-web.js] message event received:', {
      from: message.from,
      fromMe: message.fromMe,
      type: message.type,
    });
    persistIncomingMessage(message).catch((error) => {
      console.error('[whatsapp-web.js] inbound processing failed:', error);
    });
  });

  instance.on('message_create', (message: Message) => {
    if (!message.fromMe) return;
    touchActivity();
    // CRM sends are persisted by sendMessageViaBaileys. A short delay lets
    // that write win; messages sent directly from the phone are then mirrored
    // here without creating a duplicate row.
    setTimeout(() => {
      persistMessage(message, { includeOutbound: true }).catch((error) => {
        console.error('[whatsapp-web.js] outbound mirror failed:', error);
      });
    }, 1500);
  });

  instance.on('message_ack', (message: Message, ack: MessageAck) => {
    touchActivity();
    handleQrMessageAck(message, ack).catch((error) => {
      console.error('[whatsapp-web.js] message ack processing failed:', error);
    });
  });

  instance.on('authenticated', () => {
    currentState = 'starting';
    touchActivity();
    lastError = null;
  });

  instance.on('change_state', (state: string) => {
    const nextState = mapWaState(state);
    touchActivity();
    if (nextState === 'connected') {
      markConnected();
      return;
    }
    currentState = nextState;
    if (nextState === 'error' || nextState === 'disconnected') {
      lastError = `WhatsApp Web state is ${state}.`;
    }
  });

  instance.on('auth_failure', (message: unknown) => {
    markDisconnected(
      'error',
      typeof message === 'string' ? message : String(message)
    );
    scheduleReconnect(
      typeof message === 'string' ? message : 'Authentication failed.'
    );
  });

  instance.on('disconnected', (reason: unknown) => {
    if (client !== instance) return;
    const reasonText = typeof reason === 'string' ? reason : String(reason);
    markDisconnected('disconnected', reasonText);
    destroyClient('disconnected-event')
      .catch(() => undefined)
      .finally(() => scheduleReconnect(reasonText));
  });

  instance.on('error', (error: unknown) => {
    markDisconnected(
      'error',
      error instanceof Error ? error.message : String(error)
    );
    scheduleReconnect(error instanceof Error ? error.message : String(error));
  });

  return instance;
}

async function ensureClient(
  autoStart = true,
  options: { restoreOnly?: boolean } = {}
): Promise<void> {
  if (destroyPromise) await destroyPromise;

  if (client && (currentState === 'connected' || currentState === 'qr')) {
    return;
  }

  if (client && currentState === 'starting' && initPromise) {
    await initPromise;
    return;
  }

  if (options.restoreOnly && !hasSavedAuth()) {
    return;
  }

  if (!autoStart && !client) {
    return;
  }

  if (initPromise) {
    await initPromise;
    return;
  }

  if (client && (currentState === 'error' || currentState === 'disconnected')) {
    await restartBaileysSession();
  }

  if (client) return;

  manualStopRequested = false;
  currentState = 'starting';
  currentQr = null;
  connectedAt = null;
  touchActivity();
  lastError = null;
  lastRestartAt = new Date().toISOString();
  restartCount += 1;

  const initializingClient = await buildClient();
  client = initializingClient;
  initPromise = (async () => {
    try {
      const eventPromise = Promise.race([
        once(initializingClient, 'qr'),
        once(initializingClient, 'ready'),
        once(initializingClient, 'auth_failure'),
        once(initializingClient, 'disconnected'),
      ]);

      const initialization = initializingClient.initialize();
      await Promise.race([
        eventPromise,
        initialization,
        new Promise((resolve) => setTimeout(resolve, INIT_WAIT_MS)),
      ]);
    } finally {
      initPromise = null;
    }
  })();

  await initPromise;
}

export async function startBaileysSession(
  options?: StartOptions
): Promise<BaileysSessionStatus> {
  const existing = existingService();
  if (existing) return existing.start(options);
  try {
    if (options) {
      bindBaileysSessionContext(options.accountId, options.userId);
    }
    await ensureClient(options?.autoStart ?? true, {
      restoreOnly: options?.restoreOnly,
    });
    const status = getStatus();
    return status.connected ? runHealthCheck('status') : status;
  } catch (error) {
    console.error('[whatsapp-web.js] startBaileysSession failed:', error);
    lastError = error instanceof Error ? error.message : String(error);
    currentState = 'error';
    connectedAt = null;
    if (client) {
      await client.destroy().catch(() => undefined);
      client = null;
    }
    return getStatus();
  }
}

export async function getBaileysSessionStatus(): Promise<BaileysSessionStatus> {
  const existing = existingService();
  if (existing) return existing.getStatus();
  const status = getStatus();
  if (status.connected || currentState === 'starting') {
    return runHealthCheck('status');
  }
  if (
    status.hasSavedAuth &&
    sessionContext &&
    !manualStopRequested &&
    !client &&
    !initPromise &&
    currentState !== 'qr'
  ) {
    return startBaileysSession({
      accountId: sessionContext.accountId,
      userId: sessionContext.userId,
      autoStart: true,
      restoreOnly: true,
    });
  }
  return status;
}

export async function syncBaileysRecentMessages(): Promise<void> {
  const existing = existingService();
  if (existing) return existing.syncRecent();
  await syncHistory({ chatLimit: 25, messageLimit: 10 });
}

export async function syncBaileysHistory(options?: {
  chatLimit?: number;
  messageLimit?: number;
}): Promise<BaileysSyncResult> {
  const existing = existingService();
  if (existing) return existing.syncHistory(options);
  return syncHistory(options);
}

export async function restartBaileysSession(): Promise<BaileysSessionStatus> {
  const existing = existingService();
  if (existing) return existing.restart();
  const ctx = sessionContext;
  manualStopRequested = false;
  clearQrTimer();
  clearReconnectTimer();
  await destroyClient('manual-restart');
  currentState = hasSavedAuth() ? 'starting' : 'idle';
  currentQr = null;
  connectedAt = null;
  lastError = null;
  initPromise = null;

  if (ctx) {
    return startBaileysSession({
      accountId: ctx.accountId,
      userId: ctx.userId,
      autoStart: true,
      restoreOnly: hasSavedAuth(),
    });
  }

  return getStatus();
}

export async function stopBaileysSession(clearAuth = false): Promise<void> {
  const existing = existingService();
  if (existing) return existing.stop(clearAuth);
  manualStopRequested = true;
  clearQrTimer();
  clearReconnectTimer();
  clearWatchdogTimer();
  clearOutboundMirrorTimer();

  if (!client) {
    if (clearAuth) {
      await rm(authSessionDir, { recursive: true, force: true }).catch(
        (error) => {
          console.error('[whatsapp-web.js] auth cleanup failed:', error);
        }
      );
      await rm(sessionContextFile, { force: true }).catch(() => undefined);
    }
    sessionContext = null;
    currentState = 'idle';
    currentQr = null;
    connectedAt = null;
    lastActivityAt = null;
    lastError = null;
    initPromise = null;
    return;
  }

  await destroyClient('manual-stop');
  sessionContext = null;
  currentState = 'disconnected';
  currentQr = null;
  connectedAt = null;
  lastActivityAt = null;
  lastError = null;
  initPromise = null;

  if (clearAuth) {
    await rm(authSessionDir, { recursive: true, force: true }).catch(
      (error) => {
        console.error('[whatsapp-web.js] auth cleanup failed:', error);
      }
    );
    await rm(sessionContextFile, { force: true }).catch(() => undefined);
    currentState = 'idle';
  }
}

export async function sendTextViaBaileys(
  accountId: string,
  conversationId: string,
  text: string,
  options: {
    senderType?: BaileysSenderType;
    replyToMessageId?: string | null;
  } = {}
): Promise<{ messageId: string; whatsappMessageId: string }> {
  const existing = existingService();
  if (existing) {
    return existing.sendText(accountId, conversationId, text, options);
  }
  return sendMessageViaBaileys(accountId, conversationId, {
    text,
    contentType: 'text',
    senderType: options.senderType,
    replyToMessageId: options.replyToMessageId,
  });
}

export async function sendMessageViaBaileys(
  accountId: string,
  conversationId: string,
  input: SendViaBaileysInput
): Promise<{ messageId: string; whatsappMessageId: string }> {
  const existing = existingService();
  if (existing) return existing.sendMessage(accountId, conversationId, input);
  const status = getStatus();
  if (!client || !status.connected) {
    throw new Error('WhatsApp QR session is not connected.');
  }

  const contentType = input.contentType ?? 'text';
  const text = input.text.trim();
  const isMedia = ['image', 'video', 'document', 'audio'].includes(contentType);
  if (!text && !isMedia) {
    throw new Error('Message text is required.');
  }
  if (isMedia && !input.mediaUrl) {
    throw new Error(`media_url is required for ${contentType} messages.`);
  }

  const db = supabaseAdmin();
  const { data: conversation, error: convError } = await db
    .from('conversations')
    .select('*, contact:contacts(*)')
    .eq('id', conversationId)
    .eq('account_id', accountId)
    .single();

  if (convError || !conversation) {
    throw new Error('Conversation not found.');
  }

  const contact = conversation.contact;
  const to = contact?.phone ? String(contact.phone) : '';
  const conversationJids = await getConversationJidCandidates(
    db,
    conversationId
  );
  const sendCandidates = await resolveSendJidCandidates(to, conversationJids);
  if (!sendCandidates.length) {
    throw new Error(
      'Contact phone number is invalid or not registered on WhatsApp.'
    );
  }

  let quotedMessageId: string | undefined;
  if (input.replyToMessageId) {
    const { data: parent } = await db
      .from('messages')
      .select('message_id, conversation_id')
      .eq('id', input.replyToMessageId)
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (parent?.message_id) {
      quotedMessageId = parent.message_id;
    }
  }

  let content: string | MessageMedia = text;
  const sendOptions: Record<string, unknown> = {
    ignoreQuoteErrors: true,
  };
  if (quotedMessageId) sendOptions.quotedMessageId = quotedMessageId;

  if (isMedia) {
    content = await createMessageMediaFromUrl(
      input.mediaUrl!,
      contentType,
      input.filename
    );
    if (contentType !== 'audio' && text) {
      sendOptions.caption = text;
    }
    if (contentType === 'audio') {
      sendOptions.sendAudioAsVoice = true;
    }
    if (contentType === 'document') {
      sendOptions.sendMediaAsDocument = true;
    }
  }

  let sent: SentWhatsAppMessage | null = null;
  let lastSendError: unknown = null;
  for (const jid of sendCandidates) {
    try {
      const candidateSent = await client.sendMessage(jid, content, sendOptions);
      if (candidateSent) {
        sent = candidateSent;
        break;
      }
      const recovered = await findRecentSentMessageInWebStore(jid, text);
      if (recovered) {
        sent = recovered;
        break;
      }
      lastSendError = new Error(
        `WhatsApp did not return a sent message for ${jid}.`
      );
      console.warn('[whatsapp-web.js] send candidate returned empty:', { jid });
    } catch (error) {
      lastSendError = error;
      console.warn('[whatsapp-web.js] send candidate failed:', {
        jid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!sent) {
    throw lastSendError instanceof Error
      ? lastSendError
      : new Error('Failed to send WhatsApp message through QR session.');
  }

  const whatsappMessageId = sent?.id?._serialized ?? sent?.id?.id ?? '';
  if (!whatsappMessageId) {
    throw new Error('WhatsApp did not confirm the sent message id.');
  }

  const { data: messageRecord, error: msgError } = await db
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: input.senderType ?? 'agent',
      content_type: contentType,
      content_text: text || null,
      media_url: input.mediaUrl || null,
      template_name: input.templateName || null,
      interactive_payload:
        contentType === 'interactive' ? input.interactivePayload : null,
      message_id: whatsappMessageId || null,
      dedupe_key: messageDedupeKey(conversationId, whatsappMessageId),
      status: 'sent',
      reply_to_message_id: input.replyToMessageId || null,
    })
    .select('id')
    .single();

  if (msgError || !messageRecord) {
    throw new Error(
      `Message sent through QR but failed to save locally: ${msgError?.message ?? 'unknown error'}`
    );
  }

  await db
    .from('conversations')
    .update({
      last_message_text: text || `[${contentType}]`,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  if ((input.senderType ?? 'agent') === 'agent') {
    const { error: pauseErr } = await db
      .from('flow_runs')
      .update({
        status: 'paused_by_agent',
        ended_at: new Date().toISOString(),
        end_reason: 'agent_replied',
      })
      .eq('account_id', accountId)
      .eq('contact_id', contact.id)
      .eq('status', 'active');
    if (pauseErr) {
      console.error('[flows] QR pause-on-agent-send failed:', pauseErr.message);
    }
  }

  return { messageId: messageRecord.id, whatsappMessageId };
}

if (!serviceProcess.__wacrmWhatsAppService) {
  serviceProcess.__wacrmWhatsAppService = {
    owner: moduleInstanceId,
    api: {
      bindSessionContext: bindBaileysSessionContext,
      bootstrap: bootstrapBaileysSessionFromSavedAuth,
      start: startBaileysSession,
      getStatus: getBaileysSessionStatus,
      syncRecent: syncBaileysRecentMessages,
      syncHistory: syncBaileysHistory,
      restart: restartBaileysSession,
      stop: stopBaileysSession,
      sendText: sendTextViaBaileys,
      sendMessage: sendMessageViaBaileys,
    },
  };
}
