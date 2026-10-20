import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Step({
  number,
  title,
  description,
  done,
  disabled,
  children,
  action,
}: {
  number: number;
  title: string;
  description?: ReactNode;
  done?: boolean;
  disabled?: boolean;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`step-${number}`}
      className={cn(
        "relative rounded-[var(--radius-card)] border border-line bg-surface shadow-card transition-opacity",
        disabled && "pointer-events-none opacity-45",
      )}
      inert={disabled || undefined}
    >
      <header className="flex items-start gap-3.5 p-5 pb-0 sm:p-6 sm:pb-0">
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular-nums",
            done ? "border-success/30 bg-success-soft text-success" : "border-accent/30 bg-accent-soft text-accent",
          )}
          aria-hidden
        >
          {done ? <Check className="size-3.5" strokeWidth={3} /> : number}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`step-${number}`} className="text-[15px] font-semibold tracking-tight">
            <span className="sr-only">Step {number}: </span>
            {title}
          </h2>
          {description && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</p>}
        </div>
        {action}
      </header>
      {children && <div className="p-5 sm:p-6">{children}</div>}
    </section>
  );
}

export function StepRail({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label="Conversion steps">
      {steps.map((label, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li key={label} className="flex items-center gap-2" aria-current={state === "current" ? "step" : undefined}>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium",
                state === "done" && "border-success/25 bg-success-soft text-success",
                state === "current" && "border-accent/40 bg-accent-soft text-fg",
                state === "todo" && "border-line text-faint",
              )}
            >
              {state === "done" ? <Check className="size-3" strokeWidth={3} /> : <span className="tabular-nums">{i + 1}</span>}
              {label}
            </span>
            {i < steps.length - 1 && <span className="h-px w-3 bg-line-strong" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
