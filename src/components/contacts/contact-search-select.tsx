'use client';

import { useMemo, useState } from 'react';
import { Check, Search, UserRound, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Contact } from '@/types';

type ContactSearchSelectProps = {
  contacts: Contact[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
  emptyOptionLabel?: string;
  className?: string;
};

function contactTitle(contact: Contact) {
  return contact.name?.trim() || contact.phone || 'Cliente sem nome';
}

function contactDetail(contact: Contact) {
  return [
    contact.phone,
    contact.client_reference ? `Ref. ${contact.client_reference}` : null,
    contact.email,
    contact.company,
  ]
    .filter(Boolean)
    .join(' · ');
}

function contactSearchText(contact: Contact) {
  return [
    contact.name,
    contact.phone,
    contact.phone_normalized,
    contact.client_reference,
    contact.email,
    contact.company,
    contact.tax_id,
    contact.city,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('pt');
}

export function ContactSearchSelect({
  contacts,
  value,
  onChange,
  disabled = false,
  placeholder = 'Selecione um cliente',
  searchPlaceholder = 'Buscar por nome, telefone, referência, email...',
  emptyLabel = 'Nenhum cliente encontrado.',
  allowEmpty = true,
  emptyOptionLabel = 'Sem cliente',
  className,
}: ContactSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = contacts.find((contact) => contact.id === value);

  const filteredContacts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt');
    const list = normalized
      ? contacts.filter((contact) =>
          contactSearchText(contact).includes(normalized)
        )
      : contacts;

    return list.slice(0, 50);
  }, [contacts, query]);

  return (
    <div className={cn('relative min-w-0', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex h-10 w-full items-center justify-between gap-2 rounded-lg border px-3 text-left text-sm outline-none transition-colors focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50',
          open && 'border-ring ring-ring/20 ring-3'
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-full">
            <UserRound className="text-muted-foreground size-3.5" />
          </span>
          <span className="min-w-0">
            <span
              className={cn(
                'block truncate font-medium',
                !selected && 'text-muted-foreground font-normal'
              )}
            >
              {selected ? contactTitle(selected) : placeholder}
            </span>
            {selected ? (
              <span className="text-muted-foreground block truncate text-xs">
                {contactDetail(selected) || 'Sem detalhes cadastrados'}
              </span>
            ) : null}
          </span>
        </span>
        <Search className="text-muted-foreground size-4 shrink-0" />
      </button>

      {open ? (
        <div className="border-border bg-popover absolute top-full right-0 left-0 z-50 mt-1 rounded-lg border p-2 shadow-xl">
          <div className="relative mb-2">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setOpen(false);
              }}
              placeholder={searchPlaceholder}
              className="h-9 pr-8 pl-9"
            />
            {query ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setQuery('')}
                aria-label="Limpar busca de cliente"
                className="absolute top-1/2 right-1 -translate-y-1/2"
              >
                <X />
              </Button>
            ) : null}
          </div>

          <div className="max-h-72 overflow-y-auto" role="listbox">
            {allowEmpty ? (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setQuery('');
                  setOpen(false);
                }}
                className="hover:bg-muted flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{emptyOptionLabel}</span>
                  <span className="text-muted-foreground block text-xs">
                    Continuar sem cliente associado
                  </span>
                </span>
                {!value ? <Check className="text-primary size-4" /> : null}
              </button>
            ) : null}

            {allowEmpty && filteredContacts.length ? (
              <div className="bg-border mx-2 my-1 h-px" />
            ) : null}

            {filteredContacts.map((contact) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => {
                  onChange(contact.id);
                  setQuery('');
                  setOpen(false);
                }}
                className="hover:bg-muted flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left"
                role="option"
                aria-selected={contact.id === value}
              >
                <span className="bg-primary-soft text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                  {contactTitle(contact).slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {contactTitle(contact)}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {contactDetail(contact) || 'Sem telefone cadastrado'}
                  </span>
                </span>
                {contact.id === value ? (
                  <Check className="text-primary size-4 shrink-0" />
                ) : null}
              </button>
            ))}

            {!filteredContacts.length ? (
              <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                {emptyLabel}
              </p>
            ) : null}

            {contacts.length > filteredContacts.length ? (
              <p className="text-muted-foreground border-border border-t px-3 py-2 text-center text-[11px]">
                Escreva mais para refinar os resultados
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
