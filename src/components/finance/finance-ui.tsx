import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted rounded-md p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

export function FinanceMetric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
}) {
  return (
    <div className="border-border bg-card flex min-w-0 items-start justify-between gap-3 rounded-lg border p-4">
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="mt-1 truncate text-xl font-semibold">{value}</p>
        <p className="text-muted-foreground mt-1 truncate text-[11px]">
          {detail}
        </p>
      </div>
      <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md">
        <Icon className="text-muted-foreground size-4" />
      </div>
    </div>
  );
}

export function PackQuantity({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="border-border px-2 py-2 not-last:border-r">
      <p className="text-muted-foreground text-[10px] uppercase">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

export function NativeSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="border-input bg-background focus:border-ring focus:ring-ring/30 h-9 min-w-0 rounded-md border px-3 text-sm outline-none focus:ring-2"
    >
      {children}
    </select>
  );
}

export function Empty({
  icon: Icon,
  text,
  action,
  onClick,
}: {
  icon: LucideIcon;
  text: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="text-muted-foreground flex min-h-40 flex-col items-center justify-center p-6 text-center text-sm">
      <Icon className="mb-2 size-6" />
      <p>{text}</p>
      {action && onClick && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onClick}>
          {action}
        </Button>
      )}
    </div>
  );
}
