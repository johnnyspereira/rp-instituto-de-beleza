import type { SupabaseClient } from '@supabase/supabase-js';

import { createMysqlAdminClient } from '@/lib/mysql/server-client';

/** Historical import path retained; this is a trusted local MySQL client. */
export function createAdminClient() {
  return createMysqlAdminClient() as unknown as SupabaseClient;
}
