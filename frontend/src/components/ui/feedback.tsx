import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import type { Tone } from "./badge";

export function Progress({
  value,
  label,
  className,
  tone = "accent",
}: {
  value: number | null;
  label: string;
  className?: string;
  tone?: "accent" | "success" | "danger";
}) {
  const color = { accent: "bg-accent-strong", success: "bg-success", danger: "bg-danger" }[tone];
  const indeterminate = value == null;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value)}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-sunken", className)}
    >
      {indeterminate ? (
        <div className={cn("animate-shimmer absolute inset-y-0 w-1/3 rounded-full opacity-70", color)} />
      ) : (
        <div
          className={cn("h-full rounded-full transition-[width] duration-500 ease-out", color)}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-surface-hover", className)} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      <div className="mb-4 grid size-12 place-items-center rounded-2xl border border-line bg-sunken text-faint">
        {icon}
      </div>
      <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const calloutStyles: Record<Exclude<Tone, "neutral" | "accent">, { box: string; icon: ReactNode }> = {
  info: { box: "border-info/20 bg-info-soft", icon: <Info className="size-4 text-info" /> },
  success: { box: "border-success/20 bg-success-soft", icon: <CheckCircle2 className="size-4 text-success" /> },
  warning: { box: "border-warning/25 bg-warning-soft", icon: <AlertTriangle className="size-4 text-warning" /> },
  danger: { box: "border-danger/25 bg-danger-soft", icon: <XCircle className="size-4 text-danger" /> },
};

export function Callout({
  tone = "info",
  title,
  children,
  className,
  action,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  const s = calloutStyles[tone];
  return (
    <div
      className={cn("flex gap-3 rounded-xl border p-3.5 text-sm", s.box, className)}
      role={tone === "danger" ? "alert" : undefined}
    >
      <div className="mt-0.5 shrink-0">{s.icon}</div>
      <div className="min-w-0 flex-1 leading-relaxed">
        {title && <p className="font-medium text-fg">{title}</p>}
        {children && <div className={cn("text-muted", title && "mt-0.5")}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line-strong bg-sunken px-1.5 font-mono text-[11px] text-muted">
      {children}
    </kbd>
  );
}
