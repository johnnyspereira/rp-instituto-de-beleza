import { getSession } from '@/lib/auth/session';
import { getAuthContext } from '@/lib/auth/service';
import { publicStorageUrl, saveObject } from '@/lib/storage/local-storage';

export const runtime = 'nodejs';

function objectPath(accountId: string, fileName: string) {
  const extension = /\.[^.]+$/.test(fileName)
    ? fileName.split('.').pop()!.toLowerCase()
    : 'bin';
  const base =
    fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 40) || 'file';
  return `account-${accountId}/${Date.now()}-${base}.${extension}`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bucket: string }> }
) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: { message: 'Unauthorized.' } }, { status: 401 });
  }

  const auth = await getAuthContext(session.user.id);
  if (!auth) {
    return Response.json(
      { error: { message: 'Account context not found.' } },
      { status: 403 }
    );
  }

  const data = await request.formData();
  const file = data.get('file');
  if (!(file instanceof File)) {
    return Response.json(
      { error: { message: 'File is required.' } },
      { status: 400 }
    );
  }
  if (!file.size || file.size > 16 * 1024 * 1024) {
    return Response.json(
      { error: { message: 'File must be between 1 byte and 16 MB.' } },
      { status: 400 }
    );
  }

  try {
    const { bucket } = await params;
    const path = objectPath(auth.account.id, file.name);
    await saveObject(bucket, path, new Uint8Array(await file.arrayBuffer()));
    return Response.json({
      data: { path, publicUrl: publicStorageUrl(bucket, path) },
      error: null,
    });
  } catch (cause) {
    return Response.json(
      {
        error: {
          message: cause instanceof Error ? cause.message : 'Upload failed.',
        },
      },
      { status: 400 }
    );
  }
}
