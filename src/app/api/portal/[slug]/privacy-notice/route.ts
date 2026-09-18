import { randomUUID } from 'node:crypto';

import {
  privacyNoticeVersion,
  requestConsentEvidence,
} from '@/lib/privacy/consent-evidence';
import { portalErrorResponse, requirePortalAccess } from '@/lib/portal/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { admin, access } = await requirePortalAccess(slug);
    const version = await privacyNoticeVersion(admin, access.account_id);
    const { data: existing } = await admin
      .from('privacy_consent_events')
      .select('id')
      .eq('account_id', access.account_id)
      .eq('contact_id', access.contact_id)
      .eq('purpose', 'privacy_notice')
      .eq('policy_version', version)
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const evidence = await requestConsentEvidence(request);
      const { error } = await admin.from('privacy_consent_events').insert({
        id: randomUUID(),
        account_id: access.account_id,
        contact_id: access.contact_id,
        purpose: 'privacy_notice',
        status: 'not_required',
        legal_basis: 'contract',
        policy_version: version,
        source: 'client_portal_first_access',
        evidence: { ...evidence, action: 'privacy_notice_acknowledged' },
      });
      if (error) throw error;
    }

    return Response.json({ ok: true, policyVersion: version });
  } catch (error) {
    return portalErrorResponse(error);
  }
}
