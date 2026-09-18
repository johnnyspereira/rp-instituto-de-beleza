export type AgendaResource = {
  id: string;
  startsAt: string;
  endsAt: string;
  professionalId?: string | null;
  roomId?: string | null;
  status?: string | null;
  label?: string | null;
  kind: 'appointment' | 'time_block';
};

export type AvailabilityRequest = {
  startsAt: Date;
  endsAt: Date;
  professionalId?: string | null;
  roomId?: string | null;
  excludeAppointmentId?: string | null;
  excludeBlockId?: string | null;
  globalResource?: boolean;
};

export function intervalsOverlap(
  firstStart: Date,
  firstEnd: Date,
  secondStart: Date,
  secondEnd: Date
) {
  return firstStart < secondEnd && firstEnd > secondStart;
}

function sharesResource(item: AgendaResource, request: AvailabilityRequest) {
  if (request.globalResource) return true;
  if (item.kind === 'time_block' && !item.professionalId && !item.roomId) {
    return true;
  }

  return Boolean(
    (request.professionalId &&
      item.professionalId === request.professionalId) ||
    (request.roomId && item.roomId === request.roomId)
  );
}

export function findAvailabilityConflicts(
  resources: AgendaResource[],
  request: AvailabilityRequest
) {
  return resources.filter((item) => {
    if (
      (item.kind === 'appointment' &&
        item.id === request.excludeAppointmentId) ||
      (item.kind === 'time_block' && item.id === request.excludeBlockId)
    ) {
      return false;
    }
    if (
      item.kind === 'appointment' &&
      ['cancelled', 'canceled', 'no_show'].includes(
        (item.status ?? '').trim().toLowerCase()
      )
    ) {
      return false;
    }
    if (!sharesResource(item, request)) return false;

    const itemStart = new Date(item.startsAt);
    const itemEnd = new Date(item.endsAt);
    if (
      Number.isNaN(itemStart.getTime()) ||
      Number.isNaN(itemEnd.getTime()) ||
      itemEnd <= itemStart
    ) {
      return false;
    }

    return intervalsOverlap(
      request.startsAt,
      request.endsAt,
      itemStart,
      itemEnd
    );
  });
}

export function availabilityConflictMessage(conflicts: AgendaResource[]) {
  if (!conflicts.length) return null;
  const appointments = conflicts.filter(
    (item) => item.kind === 'appointment'
  ).length;
  const blocks = conflicts.length - appointments;
  const parts = [
    appointments
      ? `${appointments} marcação${appointments === 1 ? '' : 'ões'}`
      : '',
    blocks ? `${blocks} bloqueio${blocks === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  const firstConflict = conflicts[0];
  const detail = firstConflict?.label?.trim()
    ? `: ${firstConflict.label.trim()}`
    : firstConflict
      ? ` (${new Date(firstConflict.startsAt).toLocaleTimeString('pt-PT', {
          hour: '2-digit',
          minute: '2-digit',
        })}–${new Date(firstConflict.endsAt).toLocaleTimeString('pt-PT', {
          hour: '2-digit',
          minute: '2-digit',
        })})`
      : '';
  return `O horário coincide com ${parts.join(' e ')}${detail}. Altere a hora, o profissional ou a sala.`;
}

export function snapMinutesToGrid(minutes: number, step = 15) {
  return Math.round(minutes / step) * step;
}
