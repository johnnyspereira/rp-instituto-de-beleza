import { portalErrorResponse, requirePortalAccess } from '@/lib/portal/server';
import { buildSubjectDataPackage } from '@/lib/privacy/data-package';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { admin, access } = await requirePortalAccess(slug);
    const accountId = access.account_id;
    const contactId = access.contact_id;
    const document = await buildSubjectDataPackage(admin, accountId, contactId);
    return new Response(JSON.stringify(document, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="dados-pessoais-${contactId}.json"`,
        'cache-control': 'private, no-store, max-age=0',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return portalErrorResponse(error);
  }
}
