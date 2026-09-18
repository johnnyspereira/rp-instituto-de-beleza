'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle2, Gift, Loader2, Phone } from 'lucide-react';

export function VoucherTransferForm({
  voucherId,
  pin,
  disabled = false,
}: {
  voucherId: string;
  pin: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const response = await fetch(
      `/api/vouchers/${encodeURIComponent(voucherId)}/transfer`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, name, phone }),
      }
    );
    const result = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;
    setSubmitting(false);
    if (!response.ok) {
      setError(result?.error || 'Não foi possível enviar o pedido.');
      return;
    }
    setMessage(result?.message || 'Pedido enviado com sucesso.');
  }

  if (disabled) return null;

  return (
    <section className="mt-5 overflow-hidden rounded-[1.75rem] border border-stone-200 bg-white shadow-[0_18px_60px_rgba(66,45,35,0.08)]">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex w-full items-center justify-between gap-4 p-5 text-left sm:p-6"
        >
          <span className="flex items-center gap-4">
            <span className="grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
              <Gift className="size-5" />
            </span>
            <span>
              <span className="block font-bold text-stone-900">
                Quer oferecer este voucher?
              </span>
              <span className="mt-1 block text-sm text-stone-500">
                Peça a transferência para outra pessoa.
              </span>
            </span>
          </span>
          <ArrowRight className="size-5 text-stone-400 transition group-hover:translate-x-1 group-hover:text-rose-600" />
        </button>
      ) : message ? (
        <div className="p-6 text-center sm:p-8">
          <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
          <h2 className="mt-4 text-lg font-bold text-stone-900">
            Pedido recebido
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-stone-600">
            {message}
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="p-5 sm:p-7">
          <div className="mb-6">
            <p className="text-xs font-bold tracking-[0.18em] text-rose-600 uppercase">
              Transferir voucher
            </p>
            <h2 className="mt-2 text-xl font-black text-stone-900">
              Para quem deseja oferecer?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-stone-500">
              A transferência só será concluída após contacto e confirmação da
              nossa equipa.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-stone-700">
              Nome completo
              <input
                required
                minLength={2}
                maxLength={160}
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nome da pessoa"
                className="mt-2 h-12 w-full rounded-xl border border-stone-200 bg-stone-50 px-4 font-normal transition outline-none focus:border-rose-400 focus:bg-white focus:ring-4 focus:ring-rose-100"
              />
            </label>
            <label className="text-sm font-semibold text-stone-700">
              Telemóvel
              <span className="relative mt-2 block">
                <Phone className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-stone-400" />
                <input
                  required
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+351 912 345 678"
                  className="h-12 w-full rounded-xl border border-stone-200 bg-stone-50 pr-4 pl-11 font-normal transition outline-none focus:border-rose-400 focus:bg-white focus:ring-4 focus:ring-rose-100"
                />
              </span>
            </label>
          </div>

          {error ? (
            <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-11 rounded-xl px-5 text-sm font-bold text-stone-500 transition hover:bg-stone-100"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-stone-900 px-6 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Enviar pedido
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
