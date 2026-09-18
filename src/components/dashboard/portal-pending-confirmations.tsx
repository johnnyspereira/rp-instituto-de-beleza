import Link from 'next/link';
import {
  CalendarClock,
  ChevronRight,
  CircleAlert,
  Repeat2,
  UserRound,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import type { PortalPendingConfirmationItem } from '@/lib/dashboard/types';
import { Skeleton } from './skeleton';

export function PortalPendingConfirmationsCard({
  appointments,
  loading,
  error = false,
}: {
  appointments: PortalPendingConfirmationItem[] | null;
  loading: boolean;
  error?: boolean;
}) {
  if (loading) return <Skeleton className="h-56 w-full rounded-xl" />;
  if (error || !appointments?.length) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-amber-300/70 bg-card shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-200/70 bg-gradient-to-r from-amber-50 to-card px-5 py-4 dark:border-amber-900/50 dark:from-amber-950/20">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <CircleAlert className="size-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Aprovações do Portal 360</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Confirmações e pedidos de alteração que precisam da equipa.
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {appointments.length} pendente{appointments.length === 1 ? '' : 's'}
        </Badge>
      </header>
      <div className="divide-y">
        {appointments.map((appointment) => (
          <Link key={appointment.id} href={appointment.href} className="hover:bg-muted/50 flex items-center gap-3 px-5 py-3.5 transition-colors">
            <span className={appointment.kind === 'reschedule' ? 'text-violet-600' : 'text-primary'}>
              {appointment.kind === 'reschedule' ? <Repeat2 className="size-4" /> : <CalendarClock className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{appointment.contactName}</p>
              <p className="text-muted-foreground truncate text-xs">
                {appointment.serviceName} · {new Date(appointment.scheduledStart).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
              {appointment.kind === 'reschedule' && appointment.requestedStart ? (
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-violet-700 dark:text-violet-300">
                  <Repeat2 className="size-3" /> Alteração pedida para {new Date(appointment.requestedStart).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              ) : (
                <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">Confirmação da sessão pendente</p>
              )}
              <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs"><UserRound className="size-3" /> {appointment.professionalName}</p>
            </div>
            <ChevronRight className="text-muted-foreground size-4" />
          </Link>
        ))}
      </div>
      <div className="border-t px-5 py-3">
        <Link href="/agenda" className={buttonVariants({ variant: 'outline', size: 'sm' })}>Abrir Agenda</Link>
      </div>
    </section>
  );
}
