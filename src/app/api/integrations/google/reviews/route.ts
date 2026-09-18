import { getSession } from '@/lib/auth/session';
import { getAuthContext } from '@/lib/auth/service';
import { mutate, selectRows } from '@/lib/mysql/db';
import type { RowDataPacket } from 'mysql2';

async function owner() { const session = await getSession(); const auth = session ? await getAuthContext(session.user.id) : null; return auth?.profile.account_role === 'owner' ? auth : null; }
export async function GET() { const auth = await owner(); if (!auth) return Response.json({ error: 'Sem autorização.' }, { status: 403 }); const reviews = await selectRows<(RowDataPacket & { id: string; reviewer_name: string | null; rating: number; comment: string | null; approved: boolean })[]>('SELECT id,reviewer_name,rating,comment,approved FROM google_business_profile_reviews WHERE account_id=? ORDER BY reviewed_at DESC LIMIT 100', [auth.account.id]); return Response.json({ reviews }); }
export async function PATCH(request: Request) { const auth = await owner(); if (!auth) return Response.json({ error: 'Sem autorização.' }, { status: 403 }); const body = await request.json() as { id?: string; approved?: boolean }; if (!body.id) return Response.json({ error: 'Avaliação inválida.' }, { status: 400 }); await mutate('UPDATE google_business_profile_reviews SET approved=?,approved_at=IF(?,UTC_TIMESTAMP(3),NULL),approved_by_user_id=IF(?,?,NULL) WHERE id=? AND account_id=?', [Boolean(body.approved), Boolean(body.approved), auth.user.id, body.id, auth.account.id]); return Response.json({ ok: true }); }
