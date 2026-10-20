import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Card({
  className,
  interactive,
  glass,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean; glass?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-line shadow-card",
        glass ? "bg-glass backdrop-blur-xl" : "bg-surface",
        interactive &&
          "transition-[border-color,background-color,transform] duration-200 hover:border-line-strong hover:bg-surface-hover",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 p-5 pb-0", className)}>
      {icon && (
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}
