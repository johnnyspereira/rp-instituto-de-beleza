import type { Metadata } from 'next';
import Image from 'next/image';
import {
  BadgeCheck,
  CalendarDays,
  CircleX,
  Gift,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { VoucherTransferForm } from '@/components/finance/voucher-transfer-form';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Consultar voucher',
  description:
    'Consulte a autenticidade, o estado e a validade do seu voucher.',
  robots: { index: false, follow: false },
};

type VoucherResult = {
  id: string;
  code: string;
  voucher_type: 'gift_card' | 'service';
  initial_balance: number;
  current_balance: number;
  currency: string;
  status: 'pending' | 'active' | 'used' | 'expired' | 'cancelled';
  recipient_name: string | null;
  message: string | null;
  remaining_uses: number | null;
  expires_at: string | null;
  account:
    | {
        name: string;
        logo_url: string | null;
        public_url: string | null;
      }
    | {
        name: string;
        logo_url: string | null;
        public_url: string | null;
      }[];
  service: { name: string } | { name: string }[] | null;
};

function single<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] || null : value;
}

function currency(value: number, code: string) {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: code || 'EUR',
  }).format(value);
}

function effectiveStatus(voucher: VoucherResult) {
  if (
    voucher.status === 'active' &&
    voucher.expires_at &&
    new Date(voucher.expires_at).getTime() < Date.now()
  ) {
    return 'expired' as const;
  }
  return voucher.status;
}

const STATUS = {
  active: {
    label: 'Válido e ativo',
    detail: 'Este voucher está pronto para ser utilizado.',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: BadgeCheck,
  },
  pending: {
    label: 'A aguardar ativação',
    detail: 'Este voucher foi emitido, mas ainda não está ativo.',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    icon: ShieldCheck,
  },
  used: {
    label: 'Já utilizado',
    detail: 'O benefício associado a este voucher já foi utilizado.',
    className: 'border-stone-200 bg-stone-100 text-stone-600',
    icon: ShieldCheck,
  },
  expired: {
    label: 'Expirado',
    detail: 'A data de validade deste voucher já terminou.',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
    icon: CircleX,
  },
  cancelled: {
    label: 'Cancelado',
    detail: 'Este voucher foi cancelado pelo estabelecimento.',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
    icon: CircleX,
  },
} as const;

export default async function VoucherPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pin?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const pin = typeof query.pin === 'string' ? query.pin.trim() : '';

  const { data } =
    id && pin
      ? await supabaseAdmin()
          .from('finance_vouchers')
          .select(
            'id,code,voucher_type,initial_balance,current_balance,currency,status,recipient_name,message,remaining_uses,expires_at,account:accounts(name,logo_url,public_url),service:clinic_services(name)'
          )
          .eq('id', id)
          .eq('pin_code', pin)
          .maybeSingle()
      : { data: null };

  const voucher = data as VoucherResult | null;
  if (!voucher) return <InvalidVoucher />;

  const account = single(voucher.account);
  const service = single(voucher.service);
  const status = effectiveStatus(voucher);
  const statusConfig = STATUS[status];
  const StatusIcon = statusConfig.icon;
  const isService = voucher.voucher_type === 'service';

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f3ee] px-4 py-8 text-stone-900 sm:px-6 sm:py-14">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/2 -left-40 size-96 rounded-full bg-rose-200/50 blur-3xl" />
        <div className="absolute -top-32 -right-32 size-[28rem] rounded-full bg-amber-100/70 blur-3xl" />
        <div className="absolute inset-0 [background-image:radial-gradient(#c9b8a9_0.7px,transparent_0.7px)] [background-size:18px_18px] opacity-35" />
      </div>

      <div className="relative mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            {account?.logo_url ? (
              <span className="relative size-11 overflow-hidden rounded-xl bg-white">
                <Image
                  src={account.logo_url}
                  alt={account.name}
                  fill
                  sizes="44px"
                  className="object-contain p-1.5"
                  unoptimized
                />
              </span>
            ) : (
              <span className="grid size-11 place-items-center rounded-xl bg-rose-500 text-sm font-black">
                {(account?.name || 'CRM').slice(0, 2).toUpperCase()}
              </span>
            )}
            <div>
              <p className="text-sm font-bold tracking-wide">
                {account?.name || 'Voucher'}
              </p>
              <p className="text-xs text-stone-500">
                Uma experiência para oferecer
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="size-4" />
            Consulta segura
          </div>
        </div>

        <section className="relative overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-[0_30px_90px_rgba(66,45,35,0.14)]">
          <div className="absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r from-rose-500 via-[#d6b36a] to-rose-300" />
          <div className="absolute -top-24 -right-20 size-72 rounded-full border border-stone-100" />
          <div className="absolute -top-16 -right-10 size-56 rounded-full border border-stone-100" />
          <div className="absolute top-4 right-4 text-rose-100">
            <Gift className="size-40" strokeWidth={0.8} />
          </div>

          <div className="relative border-b border-stone-100 p-7 sm:p-10">
            <div
              className={`mb-8 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${statusConfig.className}`}
            >
              <StatusIcon className="size-4" />
              {statusConfig.label}
            </div>

            <p className="mb-3 text-xs font-bold tracking-[0.24em] text-[#d6b36a] uppercase">
              {isService ? 'Voucher de serviço' : 'Cartão-presente'}
            </p>
            <h1 className="max-w-xl text-4xl leading-tight font-black tracking-tight sm:text-6xl">
              {isService
                ? service?.name || 'Experiência especial'
                : currency(voucher.initial_balance, voucher.currency)}
            </h1>

            <div className="mt-10">
              <p className="text-xs tracking-[0.2em] text-stone-400 uppercase">
                Exclusivamente para
              </p>
              <p className="mt-2 text-2xl font-bold">
                {voucher.recipient_name || 'Alguém especial'}
              </p>
            </div>

            {voucher.message ? (
              <blockquote className="mt-7 max-w-xl border-l-2 border-[#d6b36a] pl-5 text-base leading-relaxed text-stone-600 italic">
                “{voucher.message}”
              </blockquote>
            ) : null}
          </div>

          <div className="relative grid gap-5 bg-stone-50/80 p-7 sm:grid-cols-3 sm:p-10">
            <Detail
              label="Estado"
              value={statusConfig.label}
              detail={statusConfig.detail}
            />
            <Detail
              label={isService ? 'Utilizações disponíveis' : 'Saldo disponível'}
              value={
                isService
                  ? String(voucher.remaining_uses ?? 1)
                  : currency(voucher.current_balance, voucher.currency)
              }
            />
            <Detail
              label="Validade"
              value={
                voucher.expires_at
                  ? new Date(voucher.expires_at).toLocaleDateString('pt-PT')
                  : 'Sem data limite'
              }
              icon={<CalendarDays className="size-4 text-[#d6b36a]" />}
            />
          </div>
        </section>

        <VoucherTransferForm
          voucherId={voucher.id}
          pin={pin}
          disabled={status !== 'active'}
        />

        <div className="mt-6 flex flex-col gap-3 px-2 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Voucher autenticado · Ref. {voucher.code}</span>
          {account?.public_url ? (
            <a
              href={account.public_url}
              className="text-stone-500 transition hover:text-rose-700"
            >
              Visitar {account.name}
            </a>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function Detail({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-stone-400 uppercase">
        {icon}
        {label}
      </div>
      <p className="mt-2 font-bold text-stone-900">{value}</p>
      {detail ? (
        <p className="mt-1 text-xs leading-relaxed text-stone-500">{detail}</p>
      ) : null}
    </div>
  );
}

function InvalidVoucher() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f3ee] px-6 text-stone-900">
      <section className="max-w-md text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl border border-rose-400/20 bg-rose-400/10 text-rose-300">
          <CircleX className="size-8" />
        </span>
        <h1 className="mt-6 text-3xl font-black">Voucher não encontrado</h1>
        <p className="mt-3 leading-relaxed text-stone-500">
          O código de autenticação não é válido. Confirme que utilizou o QR Code
          original ou contacte o estabelecimento.
        </p>
        <div className="mt-7 inline-flex items-center gap-2 text-xs text-stone-500">
          <Sparkles className="size-4 text-[#d6b36a]" />
          Validação segura de vouchers
        </div>
      </section>
    </main>
  );
}
