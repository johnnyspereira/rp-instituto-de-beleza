import 'server-only';

import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.env.LOCAL_UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads'));
const safePart = (value: string) => { if (!/^[A-Za-z0-9._/-]+$/.test(value) || value.includes('..')) throw new Error('Invalid storage path.'); return value; };
export const publicStorageUrl = (bucket: string, objectPath: string) => `/uploads/${encodeURIComponent(bucket)}/${objectPath.split('/').map(encodeURIComponent).join('/')}`;
function resolveObject(bucket: string, objectPath: string) {
  const target = path.resolve(root, safePart(bucket), safePart(objectPath));
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('Invalid storage path.');
  return target;
}
export async function saveObject(bucket: string, objectPath: string, body: Uint8Array, upsert = false) {
  const target = resolveObject(bucket, objectPath); await mkdir(path.dirname(target), { recursive: true });
  if (!upsert) { try { await stat(target); throw new Error('Object already exists.'); } catch (cause) { if (cause instanceof Error && cause.message === 'Object already exists.') throw cause; } }
  await writeFile(target, body); return { path: objectPath };
}
export async function deleteObjects(bucket: string, paths: string[]) { await Promise.all(paths.map((item) => rm(resolveObject(bucket, item), { force: true }))); }
export async function loadObject(bucket: string, objectPath: string) { return readFile(resolveObject(bucket, objectPath)); }

export function createLocalServerStorage() {
  return { from(bucket: string) { return {
    async upload(objectPath: string, body: Uint8Array | Buffer | Blob, options?: { upsert?: boolean }) { try { const bytes = body instanceof Blob ? new Uint8Array(await body.arrayBuffer()) : new Uint8Array(body); return { data: await saveObject(bucket, objectPath, bytes, options?.upsert), error: null }; } catch (cause) { return { data: null, error: { message: cause instanceof Error ? cause.message : 'Upload failed.' } }; } },
    async remove(paths: string[]) { try { await deleteObjects(bucket, paths); return { data: paths, error: null }; } catch (cause) { return { data: null, error: { message: cause instanceof Error ? cause.message : 'Delete failed.' } }; } },
    getPublicUrl(objectPath: string) { return { data: { publicUrl: publicStorageUrl(bucket, objectPath) } }; },
  }; } };
}
