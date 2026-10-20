"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Dialog as RDialog, Tooltip as RTooltip } from "radix-ui";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Button } from "./button";

// --- Tooltip ---------------------------------------------------------------

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <RTooltip.Root delayDuration={250}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-xs rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-xs text-fg shadow-card"
        >
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

// --- Dialog ----------------------------------------------------------------

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" };
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RDialog.Portal forceMount>
            <RDialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            </RDialog.Overlay>
            <RDialog.Content asChild forceMount>
              <motion.div
                className={cn(
                  "fixed top-1/2 left-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-2rem)] flex-col",
                  "rounded-2xl border border-line-strong bg-elevated shadow-2xl",
                  widths[size],
                )}
                initial={{ opacity: 0, scale: 0.97, x: "-50%", y: "-48%" }}
                animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                exit={{ opacity: 0, scale: 0.98, x: "-50%", y: "-49%" }}
                transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <div className="flex items-start gap-3 border-b border-line p-5">
                  <div className="min-w-0 flex-1">
                    <RDialog.Title className="text-base font-semibold tracking-tight">{title}</RDialog.Title>
                    {description ? (
                      <RDialog.Description className="mt-1 text-sm text-muted">{description}</RDialog.Description>
                    ) : (
                      <RDialog.Description className="sr-only">{String(title)}</RDialog.Description>
                    )}
                  </div>
                  <RDialog.Close asChild>
                    <Button variant="ghost" size="icon" aria-label="Close dialog">
                      <X className="size-4" />
                    </Button>
                  </RDialog.Close>
                </div>
                {children && <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>}
                {footer && (
                  <div className="flex flex-wrap justify-end gap-2 border-t border-line p-4">{footer}</div>
                )}
              </motion.div>
            </RDialog.Content>
          </RDialog.Portal>
        )}
      </AnimatePresence>
    </RDialog.Root>
  );
}

// --- Confirmation dialog for destructive actions ---------------------------

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  tone = "danger",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<unknown> | void;
  tone?: "danger" | "primary";
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Keep it
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
