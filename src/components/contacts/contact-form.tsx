'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import type { Contact, Tag, ContactTag } from '@/types';
import {
  findExistingContact,
  isExactMatch,
  isUniqueViolation,
  type ExistingContact,
} from '@/lib/contacts/dedupe';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertTriangle, Search, Tags } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null;
  contactTags?: ContactTag[];
  onSaved: () => void;
  /** Open an existing contact's detail view — used by the duplicate
   *  notice to jump to the contact that already owns this number. */
  onViewExisting?: (contactId: string) => void;
}

export function ContactForm({
  open,
  onOpenChange,
  contact,
  contactTags = [],
  onSaved,
  onViewExisting,
}: ContactFormProps) {
  const t = useTranslations('Contacts.form');
  const supabase = createClient();
  const { accountId } = useAuth();
  const isEdit = !!contact;

  const [name, setName] = useState('');
  const [clientReference, setClientReference] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [taxId, setTaxId] = useState('');
  const [city, setCity] = useState('');
  const [source, setSource] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('Portugal');
  const [gender, setGender] = useState('not_informed');
  const [preferredContact, setPreferredContact] = useState('whatsapp');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [whatsappConsent, setWhatsappConsent] = useState(true);
  const [saving, setSaving] = useState(false);

  // Duplicate-phone detection for NEW contacts. `exact` (same digits)
  // hard-blocks the save; a fuzzy trunk-variant match only warns. The
  // DB unique index (migration 022) is the real backstop — this is the
  // friendly heads-up before we get there.
  const [dupMatch, setDupMatch] = useState<{
    contact: ExistingContact;
    exact: boolean;
  } | null>(null);
  const [checkingDup, setCheckingDup] = useState(false);

  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [tagQuery, setTagQuery] = useState('');

  const normalizedTagQuery = tagQuery.trim().toLocaleLowerCase('pt-PT');
  const visibleTags = tags.filter((tag) =>
    tag.name.toLocaleLowerCase('pt-PT').includes(normalizedTagQuery)
  );

  useEffect(() => {
    if (open) {
      setName(contact?.name ?? '');
      setClientReference(contact?.client_reference ?? '');
      setPhone(contact?.phone ?? '');
      setEmail(contact?.email ?? '');
      setCompany(contact?.company ?? '');
      setBirthDate(contact?.birth_date ?? '');
      setTaxId(contact?.tax_id ?? '');
      setCity(contact?.city ?? '');
      setSource(contact?.source ?? '');
      setAddress(contact?.address_line ?? '');
      setPostalCode(contact?.postal_code ?? '');
      setCountry(contact?.country ?? 'Portugal');
      setGender(contact?.gender ?? 'not_informed');
      setPreferredContact(contact?.preferred_contact ?? 'whatsapp');
      setMarketingConsent(contact?.marketing_consent ?? false);
      setWhatsappConsent(contact?.whatsapp_consent ?? true);
      setSelectedTagIds(contactTags.map((ct) => ct.tag_id));
      setTagQuery('');
      setDupMatch(null);
      fetchTags();
    }
  }, [open, contact]);

  // Look up an existing contact with this number (new contacts only).
  // Runs on blur so we don't query on every keystroke.
  async function checkDuplicate() {
    if (isEdit || !accountId) return;
    const value = phone.trim();
    if (!value) {
      setDupMatch(null);
      return;
    }
    setCheckingDup(true);
    try {
      const existing = await findExistingContact(supabase, accountId, value);
      setDupMatch(
        existing
          ? { contact: existing, exact: isExactMatch(existing, value) }
          : null
      );
    } finally {
      setCheckingDup(false);
    }
  }

  async function fetchTags() {
    setLoadingTags(true);
    const { data } = await supabase.from('tags').select('*').order('name');
    if (data) setTags(data);
    setLoadingTags(false);
  }

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!phone.trim()) {
      toast.error(t('phoneRequired'));
      return;
    }

    // Hard-block an exact duplicate on create (the DB unique index is
    // the real backstop; this avoids a round-trip + a raw error toast).
    if (!isEdit && dupMatch?.exact) {
      toast.error(t('toastConflict'));
      return;
    }

    setSaving(true);

    try {
      if (!accountId)
        throw new Error('Your profile is not linked to an account.');

      let contactId = contact?.id;

      if (isEdit && contactId) {
        const { error } = await supabase
          .from('contacts')
          .update({
            name: name.trim() || null,
            client_reference: clientReference.trim() || null,
            phone: phone.trim(),
            email: email.trim() || null,
            company: company.trim() || null,
            birth_date: birthDate || null,
            tax_id: taxId.trim() || null,
            gender,
            address_line: address.trim() || null,
            postal_code: postalCode.trim() || null,
            city: city.trim() || null,
            country: country.trim() || 'Portugal',
            source: source.trim() || null,
            preferred_contact: preferredContact,
            marketing_consent: marketingConsent,
            whatsapp_consent: whatsappConsent,
            updated_at: new Date().toISOString(),
          })
          .eq('id', contactId);
        if (error) throw error;
      } else {
        const response = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            clientReference,
            phone,
            email,
            company,
            birthDate,
            taxId,
            city,
            source,
            address,
            postalCode,
            country,
            gender,
            preferredContact,
            marketingConsent,
            whatsappConsent,
            tagIds: selectedTagIds,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          contactId?: string;
        };
        if (!response.ok || !payload.contactId) {
          throw new Error(payload.error || 'Não foi possível criar o cliente.');
        }
        contactId = payload.contactId;
      }

      // The create route saves tags atomically with the profile. Existing
      // contacts retain this edit-time tag synchronisation.
      if (contactId && isEdit) {
        await supabase
          .from('contact_tags')
          .delete()
          .eq('contact_id', contactId);

        if (selectedTagIds.length > 0) {
          const tagRows = selectedTagIds.map((tag_id) => ({
            contact_id: contactId!,
            tag_id,
          }));
          const { error: tagError } = await supabase
            .from('contact_tags')
            .insert(tagRows);
          if (tagError) throw tagError;
        }
      }

      toast.success(isEdit ? t('toastSuccessEdit') : t('toastSuccessAdd'));
      onOpenChange(false);
      onSaved();
    } catch (err: unknown) {
      // The unique index (migration 022) rejects a duplicate phone that
      // slipped past the on-blur check (race, or a format that
      // normalizes equal). Surface it as the friendly duplicate notice
      // and, for new contacts, point the user at the existing record.
      if (isUniqueViolation(err)) {
        toast.error(t('toastConflict'));
        if (!isEdit && accountId) {
          const existing = await findExistingContact(
            supabase,
            accountId,
            phone.trim()
          );
          if (existing) setDupMatch({ contact: existing, exact: true });
        }
        return;
      }
      const message = err instanceof Error ? err.message : t('toastError');
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border text-popover-foreground flex h-[min(760px,calc(100dvh-3rem))] max-h-[calc(100dvh-3rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-border shrink-0 border-b px-6 py-5 pr-14">
          <DialogTitle className="text-popover-foreground">
            {isEdit ? t('editTitle') : t('addTitle')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isEdit ? t('editDesc') : t('addDesc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain px-6 py-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cf-name" className="text-muted-foreground">
                {t('nameLabel')}
              </Label>
              <Input
                id="cf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cf-client-ref" className="text-muted-foreground">
                Ref. cliente
              </Label>
              <Input
                id="cf-client-ref"
                value={clientReference}
                onChange={(e) => setClientReference(e.target.value)}
                placeholder="Automática se ficar em branco"
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cf-phone" className="text-muted-foreground">
                {t('phoneLabel')} <span className="text-red-400">*</span>
              </Label>
              <Input
                id="cf-phone"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (dupMatch) setDupMatch(null);
                }}
                onBlur={checkDuplicate}
                placeholder={t('phonePlaceholder')}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
              {dupMatch ? (
                <div
                  className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs ${
                    dupMatch.exact
                      ? 'border-red-500/40 bg-red-500/10 text-red-300'
                      : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  }`}
                >
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <div className="space-y-1">
                    <p>{dupMatch.exact ? t('dupExact') : t('dupSimilar')}</p>
                    {onViewExisting && (
                      <button
                        type="button"
                        onClick={() => onViewExisting(dupMatch.contact.id)}
                        className="font-medium underline underline-offset-2 hover:no-underline"
                      >
                        {t('viewExisting', {
                          name: dupMatch.contact.name || dupMatch.contact.phone,
                        })}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {t('phoneHint')}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cf-email" className="text-muted-foreground">
                {t('emailLabel')}
              </Label>
              <Input
                id="cf-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cf-company" className="text-muted-foreground">
                {t('companyLabel')}
              </Label>
              <Input
                id="cf-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder={t('companyPlaceholder')}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="border-border bg-muted/20 space-y-4 rounded-xl border p-4 sm:col-span-2">
              <div>
                <h3 className="text-sm font-semibold">Dados do perfil</h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  Estes dados ficam disponíveis imediatamente no Cliente 360.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cf-birth-date" className="text-muted-foreground">Data de nascimento</Label>
                  <Input id="cf-birth-date" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="bg-background" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cf-tax-id" className="text-muted-foreground">NIF</Label>
                  <Input id="cf-tax-id" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="Opcional" className="bg-background" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cf-gender" className="text-muted-foreground">Género</Label>
                  <select id="cf-gender" value={gender} onChange={(e) => setGender(e.target.value)} className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm">
                    <option value="not_informed">Não informado</option>
                    <option value="female">Feminino</option>
                    <option value="male">Masculino</option>
                    <option value="non_binary">Não binário</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cf-source" className="text-muted-foreground">Origem do contacto</Label>
                  <Input id="cf-source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Ex.: Instagram, indicação" className="bg-background" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="cf-address" className="text-muted-foreground">Morada</Label>
                  <Input id="cf-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número, complemento" className="bg-background" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cf-postal-code" className="text-muted-foreground">Código postal</Label>
                  <Input id="cf-postal-code" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="0000-000" className="bg-background" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cf-city" className="text-muted-foreground">Localidade</Label>
                  <Input id="cf-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cidade" className="bg-background" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cf-country" className="text-muted-foreground">País</Label>
                  <Input id="cf-country" value={country} onChange={(e) => setCountry(e.target.value)} className="bg-background" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cf-preferred-contact" className="text-muted-foreground">Contacto preferido</Label>
                  <select id="cf-preferred-contact" value={preferredContact} onChange={(e) => setPreferredContact(e.target.value)} className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm">
                    <option value="whatsapp">WhatsApp</option>
                    <option value="phone">Telefone</option>
                    <option value="email">Email</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-2 text-sm sm:flex-row sm:gap-5">
                <label className="flex items-center gap-2"><input type="checkbox" checked={whatsappConsent} onChange={(e) => setWhatsappConsent(e.target.checked)} /> Aceita contacto por WhatsApp</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={marketingConsent} onChange={(e) => setMarketingConsent(e.target.checked)} /> Aceita comunicações de marketing</label>
              </div>
            </div>

            <div className="border-border bg-muted/20 space-y-3 rounded-xl border p-4 sm:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-foreground flex items-center gap-2 font-semibold">
                  <Tags className="text-primary size-4" />
                  {t('tagsLabel')}
                </Label>
                <span className="text-muted-foreground text-xs">
                  {selectedTagIds.length
                    ? `${selectedTagIds.length} selecionada${selectedTagIds.length === 1 ? '' : 's'}`
                    : 'Opcional'}
                </span>
              </div>
              {loadingTags ? (
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="size-3 animate-spin" />
                  {t('loadingTags')}
                </div>
              ) : tags.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  {t('noTagsAvailable')}
                </p>
              ) : (
                <>
                  <div className="relative">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                    <Input
                      value={tagQuery}
                      onChange={(event) => setTagQuery(event.target.value)}
                      placeholder="Pesquisar etiquetas…"
                      className="bg-background pl-9"
                    />
                  </div>
                  <div className="bg-background max-h-36 overflow-y-auto rounded-lg border p-2">
                    <div className="flex flex-wrap gap-2">
                      {visibleTags.map((tag) => {
                        const selected = selectedTagIds.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => toggleTag(tag.id)}
                            aria-pressed={selected}
                            className={`inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                              selected
                                ? 'ring-primary shadow-sm ring-2 ring-offset-1'
                                : 'opacity-75 hover:opacity-100'
                            }`}
                            style={{
                              backgroundColor: tag.color + '20',
                              color: tag.color,
                              borderColor: tag.color,
                            }}
                          >
                            {tag.name}
                          </button>
                        );
                      })}
                    </div>
                    {visibleTags.length === 0 ? (
                      <p className="text-muted-foreground py-5 text-center text-xs">
                        Nenhuma etiqueta encontrada.
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>

          <DialogFooter className="bg-background border-border m-0 shrink-0 rounded-none border-t px-6 py-4 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={saving || checkingDup || (!isEdit && !!dupMatch?.exact)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? t('update') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
