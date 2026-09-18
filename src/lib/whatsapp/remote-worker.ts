type WorkerSendInput = {
  text: string;
  contentType?: string;
  mediaUrl?: string | null;
  filename?: string | null;
  templateName?: string | null;
  interactivePayload?: unknown;
  replyToMessageId?: string | null;
  senderType?: 'agent' | 'bot';
};

type WorkerSendResult = {
  messageId: string;
  whatsappMessageId: string;
};

type WorkerSessionStatus = {
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

type WorkerSyncResult = {
  chatsScanned: number;
  messagesScanned: number;
  messagesPersisted: number;
};

function runtimeEnv(name: string) {
  // Bracket access is intentional: Next must read these values from the
  // Passenger process at request time instead of folding the CI build value.
  return process.env[name]?.trim();
}

function isRemoteWorkerMode() {
  const mode = runtimeEnv('WHATSAPP_MODE');
  // One explicit transport is intentionally supported in production. This
  // prevents an old `polling_worker` setting, an absent variable, or local
  // Baileys from silently taking ownership of customer messages.
  return (
    mode === 'remote_worker' &&
    Boolean(runtimeEnv('WHATSAPP_WORKER_URL')) &&
    Boolean(runtimeEnv('WHATSAPP_WORKER_SECRET'))
  );
}

function workerConfig() {
  const url = runtimeEnv('WHATSAPP_WORKER_URL')?.replace(/\/+$/, '');
  const secret = runtimeEnv('WHATSAPP_WORKER_SECRET');
  if (!url || !secret) {
    throw new Error(
      'WHATSAPP_WORKER_URL and WHATSAPP_WORKER_SECRET are required for remote_worker mode.'
    );
  }
  return { url, secret };
}

async function workerFetch<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | boolean | number> } = {}
): Promise<T> {
  const { url, secret } = workerConfig();
  const endpoint = new URL(`${url}${path}`);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    endpoint.searchParams.set(key, String(value));
  }

  const response = await fetch(endpoint, {
    ...init,
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${secret}`,
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload.error === 'string'
        ? payload.error
        : `WhatsApp worker returned HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export const remoteWhatsAppWorker = {
  enabled: isRemoteWorkerMode,

  status(input: {
    accountId: string;
    userId: string;
    autoStart?: boolean;
  }): Promise<WorkerSessionStatus> {
    return workerFetch('/status', {
      query: {
        account_id: input.accountId,
        user_id: input.userId,
        autostart: input.autoStart ?? true,
      },
    });
  },

  restart(input: {
    accountId: string;
    userId: string;
  }): Promise<{ success: true; status: WorkerSessionStatus }> {
    return workerFetch('/restart', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  logout(input: { accountId: string }): Promise<{ success: true }> {
    return workerFetch('/logout', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  sync(input: {
    accountId: string;
    userId: string;
    chatLimit?: number;
    messageLimit?: number;
    conversationId?: string;
  }): Promise<{ success: true } & WorkerSyncResult> {
    return workerFetch('/sync', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  send(input: {
    accountId: string;
    userId: string;
    conversationId: string;
    message: WorkerSendInput;
  }): Promise<WorkerSendResult> {
    return workerFetch('/send', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  react(input: {
    accountId: string;
    userId: string;
    messageId: string;
    emoji: string;
  }): Promise<{ success: true }> {
    return workerFetch('/react', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  logs(input: { accountId: string }): Promise<{ events: Array<{ at: string; type: string; message: string; details?: Record<string, unknown> }> }> {
    return workerFetch('/logs', { query: { account_id: input.accountId } });
  },
};
