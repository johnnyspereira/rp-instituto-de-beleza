'use client';

import { createMysqlBrowserClient } from '@/lib/mysql/browser-client';
import type { SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | undefined;

/** Compatibility entry point: this client talks only to the local MySQL API. */
export function createClient() {
  if (!browserClient) {
    browserClient = createMysqlBrowserClient() as unknown as SupabaseClient;
  }
  return browserClient;
}
