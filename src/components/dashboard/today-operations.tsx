'use client';

import Link from 'next/link';
import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Gift,
  MapPin,
  PackageCheck,
  UserCheck,
  WalletCards,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { formatCurrency } from '@/lib/currency';
import type {
  TodayAppointmentItem,
  TodayOperations,
} from '@/lib/dashboard/types';
import { cn } from '@/lib/utils';

import { Skeleton } from './skeleton';

export function TodayOperationsPanel({
  data,
  loading,
  currency,
  error = false,
}: {
  data: TodayOperations | null;
  loading: boolean;
  currency: string;
  error?: boolean;
}) {
  if (loading) {
    return <Skeleton className="h-[430px] w-full rounded-lg" />;
  }
  if (error || !data) {
    return (
      <section className="border-border bg-card flex min-h-48 items-center justify-center rounded-lg border px-6 text-center">
        <div>
          <CalendarDays className="text-muted-foreground mx-auto mb-2 size-7" />
          <p className="text-sm font-semibold">Operação diária indisponível</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Atualize o Dashboard para tentar carregar novamente.
          </p>
        </div>
      </section>
    );
  }

  const now = new Date(data.generatedAt).getTime();
  const ordered = [...data.appointments].sort((left, right) => {
    const leftTime = new Date(left.scheduledStart).getTime();
    const rightTime = new Date(right.scheduledStart).getTime();
    const leftPast = leftTime < now;
    const rightPast = rightTime < now;
    if (leftPast !== rightPast) return leftPast ? 1 : -1;
    return leftTime - rightTime;
  });

  return (
    <section className="border-border bg-card overflow-hidden rounded-lg border">
      <header className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-foreground flex items-center gap-2 text-sm font-semibold">
            <CalendarDays className="text-primary size-4" /> Operação de hoje
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Agenda, recebimentos e benefícios do dia.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/finance"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <CircleDollarSign className="size-4" /> POS
          </Link>
          <Link href="/agenda" className={buttonVariants({ size: 'sm' })}>
            Abrir agenda
          </Link>
        </div>
      </header>

      <div className="grid xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,0.55fr)]">
        <div className="min-w-0 px-5 py-4 xl:border-r">
          <div className="bg-muted/40 mb-4 grid grid-cols-3 divide-x rounded-md py-2 sm:grid-cols-6">
            <DailyCount label="Marcações" value={data.appointmentsTotal} />
            <DailyCount label="Confirmadas" value={data.confirmed} />
            <DailyCount label="Chegadas" value={data.arrived} />
            <DailyCount label="Concluídas" value={data.completed} />
            <DailyCount label="Faltas" value={data.noShow} warning />
            <DailyCount label="Canceladas" value={data.cancelled} warning />
          </div>

          {ordered.length === 0 ? (
            <div className="text-muted-foreground flex min-h-56 flex-col items-center justify-center text-center text-sm">
              <CalendarDays className="mb-2 size-7" />
              Nenhuma marcação para hoje.
            </div>
          ) : (
            <div className="divide-border divide-y">
              {ordered.slice(0, 7).map((appointment) => (
                <AppointmentRow
                  key={appointment.id}
                  appointment={appointment}
                />
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-4">
          <div className="grid grid-cols-2 gap-x-5 gap-y-5">
            <MoneyDatum
              label="Previsto na agenda"
              value={formatCurrency(data.expectedRevenue, currency)}
              icon={Clock3}
            />
            <MoneyDatum
              label="Recebido hoje"
              value={formatCurrency(data.receivedToday, currency)}
              icon={CircleDollarSign}
              positive
            />
            <MoneyDatum
              label="A receber"
              value={formatCurrency(data.outstandingToday, currency)}
              icon={WalletCards}
            />
            <MoneyDatum
              label="Vendas no POS"
              value={String(data.salesToday)}
              icon={CheckCircle2}
            />
          </div>

          <div className="border-border mt-5 space-y-3 border-t pt-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Caixa</span>
              <Badge variant={data.cashSessionOpen ? 'secondary' : 'outline'}>
                {data.cashSessionOpen ? 'Aberto' : 'Fechado'}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Com voucher ou pack</span>
              <span className="font-semibold tabular-nums">
                {data.benefitsScheduled}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Taxa de conclusão</span>
              <span className="font-semibold tabular-nums">
                {data.appointmentsTotal
                  ? `${Math.round((data.completed / data.appointmentsTotal) * 100)}%`
                  : '0%'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AppointmentRow({
  appointment,
}: {
  appointment: TodayAppointmentItem;
}) {
  const start = new Date(appointment.scheduledStart);
  const end = new Date(appointment.scheduledEnd);
  return (
    <Link
      href={appointment.href}
      className="hover:bg-muted/40 grid min-w-0 gap-2 py-3 transition-colors sm:grid-cols-[66px_minmax(0,1fr)_minmax(150px,0.55fr)_auto] sm:items-center"
    >
      <span className="text-foreground font-semibold tabular-nums">
        {start.toLocaleTimeString('pt-PT', {
          hour: '2-digit',
          minute: '2-digit',
        })}
        <span className="text-muted-foreground block text-[10px] font-normal">
          até{' '}
          {end.toLocaleTimeString('pt-PT', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </span>
      <span className="min-w-0">
        <span className="text-foreground block truncate text-sm font-semibold">
          {appointment.contactName}
        </span>
        <span className="text-muted-foreground block truncate text-xs">
          {appointment.serviceName}
        </span>
      </span>
      <span className="text-muted-foreground min-w-0 text-xs">
        <span className="flex items-center gap-1 truncate">
          <UserCheck className="size-3" /> {appointment.professionalName}
        </span>
        {appointment.roomName ? (
          <span className="mt-0.5 flex items-center gap-1 truncate">
            <MapPin className="size-3" /> {appointment.roomName}
          </span>
        ) : null}
      </span>
      <span className="flex flex-wrap items-center justify-end gap-1">
        {appointment.benefit === 'pack' ? (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <PackageCheck className="size-3" /> Pack
          </Badge>
        ) : appointment.benefit ? (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Gift className="size-3" />
            {appointment.benefit === 'referral' ? 'Indicação' : 'Voucher'}
          </Badge>
        ) : null}
        <Badge
          variant="outline"
          className={cn(
            'text-[10px]',
            appointment.paid && 'border-emerald-500/40 text-emerald-600'
          )}
        >
          {appointment.paid ? 'Pago' : statusLabel(appointment.status)}
        </Badge>
      </span>
    </Link>
  );
}

function DailyCount({
  label,
  value,
  warning,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <div className="min-w-0 px-2 text-center">
      <p
        className={cn(
          'text-lg font-bold tabular-nums',
          warning && value > 0 && 'text-amber-600'
        )}
      >
        {value}
      </p>
      <p className="text-muted-foreground truncate text-[10px]">{label}</p>
    </div>
  );
}

function MoneyDatum({
  label,
  value,
  icon: Icon,
  positive,
}: {
  label: string;
  value: string;
  icon: typeof CircleDollarSign;
  positive?: boolean;
}) {
  return (
    <div className="min-w-0">
      <Icon
        className={cn(
          'text-muted-foreground mb-2 size-4',
          positive && 'text-emerald-600'
        )}
      />
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-foreground mt-0.5 truncate text-lg font-bold tabular-nums">
        {value}
      </p>
    </div>
  );
}

function statusLabel(status: TodayAppointmentItem['status']) {
  return {
    scheduled: 'Agendado',
    confirmed: 'Confirmado',
    completed: 'Concluído',
    cancelled: 'Cancelado',
    no_show: 'Falta',
  }[status];
}
