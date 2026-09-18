import Link from 'next/link';

import { cn } from '@/lib/utils';
import type { FinanceBenefitLog } from '@/types';
const BENEFIT_LOG_LABEL: Record<FinanceBenefitLog['action'], string> = {
  issued: 'Emitido',
  reserved: 'Reservado numa marcação',
  used: 'Utilizado',
  released: 'Reserva libertada',
  cancelled: 'Cancelado',
  adjusted: 'Ajustado',
};

export function BenefitLogList({
  logs,
  sourceHref,
}: {
  logs: FinanceBenefitLog[];
  sourceHref?: string;
}) {
  return (
    <details className="border-border mt-3 border-t pt-2">
      <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs font-medium">
        Ver histórico completo ({logs.length})
      </summary>
      <div className="mt-2 space-y-2">
        {logs.length ? (
          logs.map((log) => {
            const href = log.appointment?.id
              ? `/agenda?appointment=${log.appointment.id}${
                  log.appointment.scheduled_start
                    ? `&date=${log.appointment.scheduled_start.slice(0, 10)}`
                    : ''
                }`
              : sourceHref;
            const content = (
              <div
                className={cn(
                  'bg-muted/50 rounded-md p-2.5 text-xs',
                  href && 'hover:bg-muted transition-colors'
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{BENEFIT_LOG_LABEL[log.action]}</strong>
                  <span className="text-muted-foreground">
                    {new Date(log.created_at).toLocaleString('pt-PT')}
                  </span>
                </div>
                {log.appointment ? (
                  <p className="text-muted-foreground mt-1">
                    {log.appointment.service?.name ?? 'Atendimento'} ·{' '}
                    {log.appointment.contact?.name ||
                      log.appointment.contact?.phone ||
                      'Cliente'}
                    {log.appointment.scheduled_start
                      ? ` · ${new Date(log.appointment.scheduled_start).toLocaleString('pt-PT')}`
                      : ''}
                  </p>
                ) : null}
                <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    Realizado por: {log.performed_by_name || 'Sistema'}
                  </span>
                  {log.approved_by_name ? (
                    <span>Aprovado por: {log.approved_by_name}</span>
                  ) : null}
                  {Number(log.amount) > 0 ? (
                    <span>Valor: {Number(log.amount).toFixed(2)}</span>
                  ) : null}
                  {Number(log.sessions) > 0 ? (
                    <span>Sessões: {log.sessions}</span>
                  ) : null}
                </div>
                {href ? (
                  <p className="text-primary mt-2 text-[11px] font-medium">
                    Abrir registo original
                  </p>
                ) : null}
              </div>
            );
            return href ? (
              <Link key={log.id} href={href} className="block">
                {content}
              </Link>
            ) : (
              <div key={log.id}>{content}</div>
            );
          })
        ) : (
          <p className="text-muted-foreground py-2 text-xs">
            Nenhum evento registado.
          </p>
        )}
      </div>
    </details>
  );
}
