"use client";

import { Check, ChevronDown } from "lucide-react";
import { Select as RSelect, Switch as RSwitch } from "radix-ui";
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-fg">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-xl border border-line bg-sunken px-3 text-sm text-fg placeholder:text-faint",
        "transition-colors hover:border-line-strong focus:border-accent/60 focus:outline-none",
        "disabled:opacity-50 aria-[invalid=true]:border-danger/60",
        className,
      )}
      {...props}
    />
  );
});

export interface Option<T extends string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  id,
  disabled,
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  id?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <RSelect.Root value={value} onValueChange={(v) => onChange(v as T)} disabled={disabled}>
      <RSelect.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-line bg-sunken px-3 text-left text-sm",
          "transition-colors hover:border-line-strong data-[state=open]:border-accent/60 disabled:opacity-50",
          className,
        )}
      >
        <RSelect.Value />
        <RSelect.Icon>
          <ChevronDown className="size-4 text-faint" />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-2xl"
        >
          <RSelect.Viewport className="p-1">
            {options.map((o) => (
              <RSelect.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="relative flex cursor-pointer flex-col rounded-lg py-2 pr-3 pl-8 text-sm outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-surface-hover"
              >
                <RSelect.ItemIndicator className="absolute top-2.5 left-2.5">
                  <Check className="size-3.5 text-accent" />
                </RSelect.ItemIndicator>
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
                {o.description && <span className="text-xs text-faint">{o.description}</span>}
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-start justify-between gap-4", disabled && "opacity-55")}>
      <div className="min-w-0">
        <label htmlFor={id} className="text-[13px] font-medium text-fg">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-faint">{description}</p>}
      </div>
      <RSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="relative mt-0.5 h-6 w-10 shrink-0 rounded-full border border-line-strong bg-sunken transition-colors data-[state=checked]:border-accent/50 data-[state=checked]:bg-accent-strong"
      >
        <RSwitch.Thumb className="block size-[18px] translate-x-[2px] rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </RSwitch.Root>
    </div>
  );
}

/** A row of mutually exclusive options (an accessible radio group). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex flex-wrap gap-1 rounded-xl border border-line bg-sunken p-1", className)}
      onKeyDown={(e) => {
        if (!["ArrowRight", "ArrowLeft"].includes(e.key)) return;
        e.preventDefault();
        const enabled = options.filter((o) => !o.disabled);
        const i = enabled.findIndex((o) => o.value === value);
        const next = enabled[(i + (e.key === "ArrowRight" ? 1 : -1) + enabled.length) % enabled.length];
        onChange(next.value);
        const target = e.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`);
        target?.focus();
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-value={o.value}
            tabIndex={active ? 0 : -1}
            disabled={o.disabled}
            title={o.description}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40",
              active ? "bg-surface text-fg shadow-sm ring-1 ring-line-strong" : "text-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] hover:bg-surface-hover",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className="grid size-4 shrink-0 place-items-center rounded-[5px] border border-line-strong bg-sunken peer-checked:border-accent peer-checked:bg-accent-strong peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]"
      >
        {checked && <Check className="size-3 text-white" strokeWidth={3} />}
      </span>
      <span className="text-fg">{label}</span>
    </label>
  );
}
