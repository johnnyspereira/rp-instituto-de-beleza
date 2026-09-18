import 'server-only';

import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';

import { mutate, selectRows } from '@/lib/mysql/db';

export function isPollingWorkerMode() {
  // Retained only for read compatibility with old records. New runtime code
  // must use the secured remote_worker endpoint exclusively.
  return false;
}

export async function getPollingWorkerStatus(accountId: string) {
  const rows = await selectRows<
    (RowDataPacket & {
      connected: number;
      state: string;
      qr: string | null;
      user_jid: string | null;
      has_saved_auth: number;
      connected_at: Date | null;
      last_activity_at: Date | null;
      last_error: string | null;
      last_seen_at: Date;
    })[]
  >(
    `SELECT connected,state,qr,user_jid,has_saved_auth,connected_at,
      last_activity_at,last_error,last_seen_at
     FROM whatsapp_worker_health WHERE account_id=? LIMIT 1`,
    [accountId]
  );
  const row = rows[0];
  if (!row) {
    return {
      connected: false,
      state: 'offline' as const,
      qr: null,
      lastError: 'O worker local ainda não comunicou com o CRM.',
      userJid: null,
      connectedAt: null,
      connectedForSeconds: null,
      hasSavedAuth: false,
      isStarting: false,
      lastActivityAt: null,
      lastRestartAt: null,
      restartCount: 0,
    };
  }
  const lastSeen = new Date(row.last_seen_at);
  const online = Date.now() - lastSeen.getTime() < 30_000;
  const connectedAt = row.connected_at ? new Date(row.connected_at) : null;
  return {
    connected: online && Boolean(row.connected),
    state: online ? row.state : 'offline',
    qr: online ? row.qr : null,
    lastError: online ? row.last_error : 'O worker local está offline.',
    userJid: row.user_jid,
    connectedAt: connectedAt?.toISOString() ?? null,
    connectedForSeconds:
      online && connectedAt
        ? Math.max(0, Math.floor((Date.now() - connectedAt.getTime()) / 1000))
        : null,
    hasSavedAuth: Boolean(row.has_saved_auth),
    isStarting: online && row.state === 'starting',
    lastActivityAt: row.last_activity_at
      ? new Date(row.last_activity_at).toISOString()
      : null,
    lastRestartAt: null,
    restartCount: 0,
  };
}

export async function enqueueWorkerCommand(
  accountId: string,
  commandType: 'restart' | 'logout' | 'sync',
  payload?: Record<string, unknown>
) {
  const id = randomUUID();
  await mutate(
    `INSERT INTO whatsapp_worker_commands(id,account_id,command_type,payload)
     VALUES(?,?,?,?)`,
    [id, accountId, commandType, payload ? JSON.stringify(payload) : null]
  );
  return id;
}
