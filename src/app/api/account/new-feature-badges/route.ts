import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth/session';
import { getAuthContext } from '@/lib/auth/service';
import { mutate } from '@/lib/mysql/db';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

async function getOwnerContext() {
  const session = await getSession();
  if (!session) return null;

  const context = await getAuthContext(session.user.id);
  if (!context || context.profile.account_role !== 'owner') return null;
  return context;
}

export async function PATCH(request: Request) {
  const context = await getOwnerContext();
  if (!context) {
    return NextResponse.json(
      { error: 'Apenas o proprietário pode alterar esta opção.' },
      { status: 403 }
    );
  }

  const limit = checkRateLimit(
    `owner:feature-badges:${context.user.id}`,
    RATE_LIMITS.adminAction
  );
  if (!limit.success) return rateLimitResponse(limit);

  const body = (await request.json().catch(() => null)) as {
    enabled?: unknown;
  } | null;
  if (typeof body?.enabled !== 'boolean') {
    return NextResponse.json(
      { error: "'enabled' deve ser booleano." },
      { status: 400 }
    );
  }

  await mutate(
    'UPDATE accounts SET new_feature_badges_enabled = ? WHERE id = ?',
    [body.enabled, context.account.id]
  );

  return NextResponse.json({ enabled: body.enabled });
}
