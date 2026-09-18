'use client';

import { RotateCcw, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

type PainZone = {
  id: string;
  label: string;
  view: 'front' | 'back';
  x: number;
  y: number;
};

export const BODY_PAIN_ZONES: PainZone[] = [
  { id: 'front-neck', label: 'Pescoço', view: 'front', x: 50, y: 18 },
  {
    id: 'front-left-shoulder',
    label: 'Ombro esquerdo',
    view: 'front',
    x: 35,
    y: 23,
  },
  {
    id: 'front-right-shoulder',
    label: 'Ombro direito',
    view: 'front',
    x: 65,
    y: 23,
  },
  { id: 'front-chest', label: 'Peito', view: 'front', x: 50, y: 31 },
  {
    id: 'front-left-arm',
    label: 'Braço esquerdo',
    view: 'front',
    x: 27,
    y: 39,
  },
  {
    id: 'front-right-arm',
    label: 'Braço direito',
    view: 'front',
    x: 73,
    y: 39,
  },
  { id: 'front-abdomen', label: 'Abdómen', view: 'front', x: 50, y: 44 },
  { id: 'front-left-hand', label: 'Mão esquerda', view: 'front', x: 20, y: 55 },
  { id: 'front-right-hand', label: 'Mão direita', view: 'front', x: 80, y: 55 },
  {
    id: 'front-left-thigh',
    label: 'Coxa esquerda',
    view: 'front',
    x: 42,
    y: 69,
  },
  {
    id: 'front-right-thigh',
    label: 'Coxa direita',
    view: 'front',
    x: 58,
    y: 69,
  },
  {
    id: 'front-left-knee',
    label: 'Joelho esquerdo',
    view: 'front',
    x: 41,
    y: 80,
  },
  {
    id: 'front-right-knee',
    label: 'Joelho direito',
    view: 'front',
    x: 59,
    y: 80,
  },
  {
    id: 'front-left-leg',
    label: 'Perna esquerda',
    view: 'front',
    x: 40,
    y: 90,
  },
  {
    id: 'front-right-leg',
    label: 'Perna direita',
    view: 'front',
    x: 60,
    y: 90,
  },
  {
    id: 'back-head',
    label: 'Parte posterior da cabeça',
    view: 'back',
    x: 50,
    y: 9,
  },
  { id: 'back-neck', label: 'Nuca', view: 'back', x: 50, y: 18 },
  {
    id: 'back-left-shoulder',
    label: 'Ombro esquerdo (costas)',
    view: 'back',
    x: 35,
    y: 23,
  },
  {
    id: 'back-right-shoulder',
    label: 'Ombro direito (costas)',
    view: 'back',
    x: 65,
    y: 23,
  },
  {
    id: 'back-upper',
    label: 'Parte superior das costas',
    view: 'back',
    x: 50,
    y: 31,
  },
  {
    id: 'back-left-arm',
    label: 'Braço esquerdo (costas)',
    view: 'back',
    x: 27,
    y: 40,
  },
  {
    id: 'back-right-arm',
    label: 'Braço direito (costas)',
    view: 'back',
    x: 73,
    y: 40,
  },
  { id: 'back-lumbar', label: 'Lombar', view: 'back', x: 50, y: 45 },
  {
    id: 'back-left-hand',
    label: 'Mão esquerda (costas)',
    view: 'back',
    x: 20,
    y: 55,
  },
  {
    id: 'back-right-hand',
    label: 'Mão direita (costas)',
    view: 'back',
    x: 80,
    y: 55,
  },
  { id: 'back-glutes', label: 'Glúteos', view: 'back', x: 50, y: 58 },
  {
    id: 'back-left-thigh',
    label: 'Coxa esquerda (costas)',
    view: 'back',
    x: 42,
    y: 69,
  },
  {
    id: 'back-right-thigh',
    label: 'Coxa direita (costas)',
    view: 'back',
    x: 58,
    y: 69,
  },
  {
    id: 'back-left-knee',
    label: 'Parte posterior do joelho esquerdo',
    view: 'back',
    x: 41,
    y: 80,
  },
  {
    id: 'back-right-knee',
    label: 'Parte posterior do joelho direito',
    view: 'back',
    x: 59,
    y: 80,
  },
  { id: 'back-left-calf', label: 'Gémeo esquerdo', view: 'back', x: 40, y: 90 },
  { id: 'back-right-calf', label: 'Gémeo direito', view: 'back', x: 60, y: 90 },
];

const ZONES_PREFIX = 'Zonas marcadas:';
const NOTES_PREFIX = 'Observações:';

export function parseBodyPainAnswer(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return { zones: [] as string[], notes: '' };
  if (!trimmed.startsWith(ZONES_PREFIX)) {
    const legacyZone = BODY_PAIN_ZONES.find(
      (zone) =>
        zone.label.toLocaleLowerCase('pt-PT') ===
        trimmed.toLocaleLowerCase('pt-PT')
    );
    return legacyZone
      ? { zones: [legacyZone.id], notes: '' }
      : { zones: [] as string[], notes: trimmed };
  }
  const [zoneLine, ...noteLines] = trimmed.split('\n');
  const labels = zoneLine
    .slice(ZONES_PREFIX.length)
    .split(',')
    .map((item) => item.trim());
  return {
    zones: BODY_PAIN_ZONES.filter((zone) => labels.includes(zone.label)).map(
      (zone) => zone.id
    ),
    notes: noteLines
      .join('\n')
      .replace(new RegExp(`^${NOTES_PREFIX}\\s*`), '')
      .trim(),
  };
}

export function serializeBodyPainAnswer(zones: string[], notes: string) {
  const labels = zones
    .map((id) => BODY_PAIN_ZONES.find((zone) => zone.id === id)?.label)
    .filter((label): label is string => Boolean(label));
  if (!labels.length && !notes.trim()) return '';
  return [
    `${ZONES_PREFIX} ${labels.length ? labels.join(', ') : 'Nenhuma'}`,
    notes.trim() ? `${NOTES_PREFIX} ${notes.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function BodyPainMap({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const parsed = parseBodyPainAnswer(value);
  const selected = new Set(parsed.zones);
  const update = (zones: string[], notes = parsed.notes) =>
    onChange(serializeBodyPainAnswer(zones, notes));
  const toggle = (zoneId: string) =>
    update(
      selected.has(zoneId)
        ? parsed.zones.filter((id) => id !== zoneId)
        : [...parsed.zones, zoneId]
    );

  return (
    <div className="space-y-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
      <div>
        <p className="text-sm font-medium">
          Toque nas zonas onde sente dor ou sensibilidade
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          Pode selecionar várias áreas na vista frontal e posterior.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <BodyView
          title="Frente"
          view="front"
          selected={selected}
          onToggle={toggle}
        />
        <BodyView
          title="Costas"
          view="back"
          selected={selected}
          onToggle={toggle}
        />
      </div>
      {parsed.zones.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-live="polite">
          {parsed.zones.map((id) => {
            const zone = BODY_PAIN_ZONES.find((item) => item.id === id);
            return zone ? (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                className="flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1.5 text-xs font-medium text-rose-800"
              >
                {zone.label} <X className="size-3" aria-hidden="true" />
              </button>
            ) : null;
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => update([])}
          >
            <RotateCcw className="size-3.5" /> Limpar marcações
          </Button>
        </div>
      )}
    </div>
  );
}

function BodyView({
  title,
  view,
  selected,
  onToggle,
}: {
  title: string;
  view: 'front' | 'back';
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <section className="rounded-lg border bg-white p-3">
      <p className="text-center text-xs font-semibold tracking-wider text-slate-500 uppercase">
        {title}
      </p>
      <div className="relative mx-auto mt-2 aspect-[3/5] max-h-[390px] w-full max-w-[235px]">
        <BodySilhouette back={view === 'back'} />
        {BODY_PAIN_ZONES.filter((zone) => zone.view === view).map((zone) => {
          const active = selected.has(zone.id);
          return (
            <button
              key={zone.id}
              type="button"
              title={zone.label}
              aria-label={`${active ? 'Desmarcar' : 'Marcar'} ${zone.label}`}
              aria-pressed={active}
              onClick={() => onToggle(zone.id)}
              style={{ left: `${zone.x}%`, top: `${zone.y}%` }}
              className={`absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-sm transition hover:scale-110 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none ${active ? 'border-rose-700 bg-rose-500/90 ring-4 ring-rose-200' : 'border-white bg-emerald-500/35 hover:bg-emerald-500/60'}`}
            >
              <span className="sr-only">{zone.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function BodySilhouette({ back }: { back: boolean }) {
  const gradientId = `body-${back ? 'back' : 'front'}`;
  return (
    <svg viewBox="0 0 180 300" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="#dfe9e3" />
          <stop offset="1" stopColor="#c8d8cf" />
        </linearGradient>
      </defs>
      <g fill={`url(#${gradientId})`} stroke="#82998d" strokeWidth="1.4">
        <circle cx="90" cy="27" r="18" />
        <rect x="82" y="43" width="16" height="15" rx="7" />
        <path d="M58 58 Q90 48 122 58 L116 139 Q103 151 90 151 Q77 151 64 139 Z" />
        <path d="M60 61 Q47 64 42 82 L27 143 Q25 154 34 157 Q43 159 47 148 L65 91 Z" />
        <path d="M120 61 Q133 64 138 82 L153 143 Q155 154 146 157 Q137 159 133 148 L115 91 Z" />
        <ellipse cx="31" cy="166" rx="9" ry="15" />
        <ellipse cx="149" cy="166" rx="9" ry="15" />
        <path d="M67 139 Q75 148 89 150 L83 224 Q80 240 67 285 Q63 295 52 291 Q45 287 49 276 L59 218 L57 161 Z" />
        <path d="M113 139 Q105 148 91 150 L97 224 Q100 240 113 285 Q117 295 128 291 Q135 287 131 276 L121 218 L123 161 Z" />
      </g>
      <g fill="none" stroke="#9eb0a6" strokeWidth="1">
        {back ? (
          <>
            <path d="M90 59V145" />
            <path d="M69 86Q90 96 111 86" />
            <path d="M69 125Q90 116 111 125" />
          </>
        ) : (
          <>
            <path d="M69 88Q90 78 111 88" />
            <path d="M90 91V139" />
          </>
        )}
      </g>
    </svg>
  );
}
