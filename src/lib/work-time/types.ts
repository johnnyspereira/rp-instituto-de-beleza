export type WorkSessionStatus = 'open' | 'closed' | 'absent';
export type WorkBreakReason = 'forced_inactivity' | 'manual' | 'system_lock';

export interface WorkSession {
  id: string;
  account_id: string;
  user_id: string;
  work_date: string;
  status: WorkSessionStatus;
  started_at: string;
  last_active_at: string;
  ended_at: string | null;
  closed_at: string | null;
  absence_reason: string | null;
  absence_recorded_at: string | null;
}

export interface WorkBreak {
  id: string;
  session_id: string;
  account_id: string;
  user_id: string;
  reason: WorkBreakReason;
  started_at: string;
  ended_at: string | null;
  justification: string | null;
  justified_at: string | null;
}

export interface WorkTimeTotals {
  grossSeconds: number;
  breakSeconds: number;
  netSeconds: number;
  openBreakSeconds: number;
}

export interface WorkTimeDay {
  session: WorkSession;
  breaks: WorkBreak[];
  totals: WorkTimeTotals;
}

export interface WorkTimeSnapshot {
  session: WorkSession | null;
  breaks: WorkBreak[];
  totals: WorkTimeTotals;
  serverNow: string;
  recent: WorkTimeDay[];
}
