import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { nextNumericClientReference } from '@/lib/contacts/client-reference';
import { findExistingContact } from '@/lib/contacts/dedupe';
import { isValidE164, sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils';

const genderValues = new Set(['male', 'female', 'non_binary', 'not_informed']);
const preferredContactValues = new Set(['whatsapp', 'phone', 'email']);

const text = (value: unknown, max = 1000) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** Creates the complete basic Client 360 profile in one server transaction path. */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return Response.json({ error: 'Dados do cliente inválidos.' }, { status: 400 });

    const phone = sanitizePhoneForMeta(text(body.phone, 50));
    if (!isValidE164(phone)) {
      return Response.json({ error: 'Informe um telefone válido com indicativo do país.' }, { status: 400 });
    }
    const existing = await findExistingContact(supabase, accountId, phone);
    if (existing) {
      return Response.json({ error: 'Já existe um cliente com este telefone.', contactId: existing.id }, { status: 409 });
    }

    let clientReference = text(body.clientReference, 50);
    if (!clientReference) {
      const { data: references, error } = await supabase
        .from('contacts')
        .select('client_reference')
        .eq('account_id', accountId);
      if (error) throw error;
      clientReference = nextNumericClientReference((references ?? []).map((row) => row.client_reference));
    }

    const gender = text(body.gender, 30);
    const preferredContact = text(body.preferredContact, 30);
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .insert({
        user_id: userId,
        account_id: accountId,
        name: text(body.name, 255) || null,
        client_reference: clientReference,
        phone,
        email: text(body.email, 320) || null,
        company: text(body.company, 255) || null,
        birth_date: text(body.birthDate, 10) || null,
        tax_id: text(body.taxId, 100) || null,
        gender: genderValues.has(gender) ? gender : null,
        address_line: text(body.address, 2000) || null,
        postal_code: text(body.postalCode, 30) || null,
        city: text(body.city, 150) || null,
        country: text(body.country, 150) || 'Portugal',
        source: text(body.source, 150) || null,
        preferred_contact: preferredContactValues.has(preferredContact)
          ? preferredContact
          : 'whatsapp',
        marketing_consent: body.marketingConsent === true,
        whatsapp_consent: body.whatsappConsent !== false,
      })
      .select('id')
      .single();
    if (contactError || !contact) throw contactError ?? new Error('Não foi possível criar o cliente.');

    const requestedTagIds = Array.isArray(body.tagIds)
      ? body.tagIds.filter((id): id is string => typeof id === 'string' && id.length <= 64)
      : [];
    if (requestedTagIds.length) {
      const { data: accountTags, error: tagsError } = await supabase
        .from('tags')
        .select('id')
        .eq('account_id', accountId)
        .in('id', requestedTagIds);
      if (tagsError) throw tagsError;
      const tagIds = (accountTags ?? []).map((tag) => tag.id);
      if (tagIds.length) {
        const { error } = await supabase
          .from('contact_tags')
          .insert(tagIds.map((tag_id) => ({ contact_id: contact.id, tag_id })));
        if (error) throw error;
      }
    }

    return Response.json({ success: true, contactId: contact.id }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
