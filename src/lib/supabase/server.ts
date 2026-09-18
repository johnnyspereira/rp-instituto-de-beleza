import type { SupabaseClient } from '@supabase/supabase-js';

import { createMysqlServerClient } from '@/lib/mysql/server-client';

/** Historical import path retained; no Supabase network connection is made. */
export async function createClient() {
  return createMysqlServerClient() as unknown as SupabaseClient;
}
