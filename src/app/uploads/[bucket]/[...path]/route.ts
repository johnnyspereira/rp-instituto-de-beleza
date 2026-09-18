import { loadObject } from '@/lib/storage/local-storage';

export const runtime = 'nodejs';
function contentType(path: string[]) {
  const extension = path.at(-1)?.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
    pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain; charset=utf-8', mp3: 'audio/mpeg', ogg: 'audio/ogg', mp4: 'video/mp4',
  };
  return types[extension ?? ''] ?? 'application/octet-stream';
}
export async function GET(_request: Request, { params }: { params: Promise<{ bucket: string; path: string[] }> }) {
  try { const value = await params; const body = await loadObject(value.bucket, value.path.join('/')); return new Response(body, { headers: { 'Cache-Control': 'public,max-age=3600', 'Content-Type': contentType(value.path), 'X-Content-Type-Options': 'nosniff' } }); }
  catch { return new Response('Not found', { status: 404 }); }
}
