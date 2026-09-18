import type { RowDataPacket } from 'mysql2';

import { registerOwner } from '@/lib/auth/service';
import { createSession } from '@/lib/auth/session';
import { selectRows } from '@/lib/mysql/db';
import { getPublicUrl } from '@/lib/public-url';

type CountRow = RowDataPacket & { total: number };

async function installationState() {
  const rows = await selectRows<CountRow[]>('SELECT COUNT(*) AS total FROM app_users');
  return { installed: Number(rows[0]?.total ?? 0) > 0, database: 'connected' as const };
}

export async function GET() {
  try {
    return Response.json(await installationState());
  } catch (error) {
    return Response.json(
      { installed: false, database: 'error', error: error instanceof Error ? error.message : 'MySQL connection failed.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const isForm = request.headers.get('content-type')?.includes('application/x-www-form-urlencoded') || request.headers.get('content-type')?.includes('multipart/form-data');
  try {
    if ((await installationState()).installed) {
      if (isForm) throw new Error('A instalação inicial já foi concluída.');
      return Response.json({ error: 'A instalação inicial já foi concluída.' }, { status: 409 });
    }
    const body = isForm
      ? Object.fromEntries(await request.formData())
      : ((await request.json()) as Record<string, unknown>);
    const fullName = String(body.fullName ?? '').trim();
    const accountName = String(body.accountName ?? '').trim();
    const email = String(body.email ?? '').trim();
    const password = String(body.password ?? '');
    const confirmPassword = String(body.confirmPassword ?? password);
    if (!fullName || !accountName || !email || password.length < 8) {
      if (isForm) throw new Error('Preencha todos os campos; a senha deve ter pelo menos 8 caracteres.');
      return Response.json({ error: 'Preencha todos os campos; a senha deve ter pelo menos 8 caracteres.' }, { status: 400 });
    }
    if (password !== confirmPassword) {
      if (isForm) throw new Error('As senhas não coincidem.');
      return Response.json({ error: 'As senhas não coincidem.' }, { status: 400 });
    }
    const user = await registerOwner({ fullName, accountName, email, password });
    await createSession(user.id);
    if (isForm) return Response.redirect(getPublicUrl('/dashboard', new URL(request.url).origin), 303);
    return Response.json({ success: true, user }, { status: 201 });
  } catch (error) {
    if (isForm) {
      const url = new URL(getPublicUrl('/install', new URL(request.url).origin));
      url.searchParams.set('error', error instanceof Error ? error.message : 'Não foi possível concluir a instalação.');
      return Response.redirect(url, 303);
    }
    return Response.json({ error: error instanceof Error ? error.message : 'Não foi possível concluir a instalação.' }, { status: 400 });
  }
}
