import { registerOwner } from '@/lib/auth/service';
import { createSession } from '@/lib/auth/session';

function isDuplicateEntry(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ER_DUP_ENTRY'
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
    fullName?: unknown;
  } | null;

  if (
    typeof body?.email !== 'string' ||
    typeof body.password !== 'string' ||
    typeof body.fullName !== 'string'
  ) {
    return Response.json(
      { error: 'Name, email and password are required.' },
      { status: 400 }
    );
  }

  try {
    const user = await registerOwner({
      email: body.email,
      password: body.password,
      fullName: body.fullName,
    });
    await createSession(user.id);
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    if (isDuplicateEntry(error)) {
      return Response.json(
        { error: 'An account with this email already exists.' },
        { status: 409 }
      );
    }
    const message =
      error instanceof Error ? error.message : 'Unable to create account.';
    return Response.json({ error: message }, { status: 400 });
  }
}
