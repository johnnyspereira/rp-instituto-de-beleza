import { getSession } from '@/lib/auth/session';
import { deleteObjects, saveObject } from '@/lib/storage/local-storage';

export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: Promise<{ bucket: string }> }) {
  if (!(await getSession())) return Response.json({ error: { message: 'Unauthorized.' } }, { status: 401 });
  const data = await request.formData(); const file = data.get('file'); const objectPath = String(data.get('path') ?? '');
  if (!(file instanceof File) || !objectPath) return Response.json({ error: { message: 'File and path are required.' } }, { status: 400 });
  try { const { bucket } = await params; const saved = await saveObject(bucket, objectPath, new Uint8Array(await file.arrayBuffer()), data.get('upsert') === 'true'); return Response.json({ data: saved, error: null }); }
  catch (cause) { return Response.json({ data: null, error: { message: cause instanceof Error ? cause.message : 'Upload failed.' } }, { status: 400 }); }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ bucket: string }> }) {
  if (!(await getSession())) return Response.json({ error: { message: 'Unauthorized.' } }, { status: 401 });
  const body = await request.json().catch(() => null) as { paths?: string[] } | null;
  try { const { bucket } = await params; await deleteObjects(bucket, body?.paths ?? []); return Response.json({ data: body?.paths ?? [], error: null }); }
  catch (cause) { return Response.json({ data: null, error: { message: cause instanceof Error ? cause.message : 'Delete failed.' } }, { status: 400 }); }
}
