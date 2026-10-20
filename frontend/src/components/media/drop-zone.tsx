"use client";

import { AlertCircle, CheckCircle2, Film, FolderOpen, Loader2, UploadCloud, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";

import { ACCEPTED_EXTENSIONS, extensionOf, useUploads, type Upload } from "../providers/uploads";
import { Button } from "../ui/button";
import { Progress } from "../ui/feedback";

export function DropZone({
  size = "lg",
  onFilesAdded,
  onBrowseLibrary,
  footer,
}: {
  size?: "lg" | "sm";
  onFilesAdded?: (uploads: Upload[]) => void;
  onBrowseLibrary?: () => void;
  footer?: ReactNode;
}) {
  const { addFiles } = useUploads();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const accept = (files: FileList | null) => {
    if (!files?.length) return;
    const added = addFiles(files);
    onFilesAdded?.(added);
  };

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        accept(e.dataTransfer.files);
      }}
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius-card)] border border-dashed transition-colors duration-200",
        dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-sunken/50 hover:border-accent/50",
        size === "lg" ? "p-8 sm:p-12" : "p-5",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300",
          dragging && "opacity-100",
        )}
        style={{ background: "radial-gradient(600px 200px at 50% 0%, var(--accent-glow), transparent 70%)" }}
        aria-hidden
      />
      <div className="relative flex flex-col items-center text-center">
        <motion.div
          animate={dragging ? { y: -4, scale: 1.05 } : { y: 0, scale: 1 }}
          className={cn(
            "grid shrink-0 place-items-center rounded-2xl border border-line bg-surface text-accent shadow-card",
            size === "lg" ? "mb-5 size-16" : "mb-3 size-10",
          )}
        >
          <UploadCloud className={size === "lg" ? "size-7" : "size-5"} />
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className={cn("font-semibold tracking-tight", size === "lg" ? "text-lg" : "text-sm")}>
            {dragging ? "Drop to import" : "Drag movies here"}
          </p>
          <p className={cn("mt-1 text-muted", size === "lg" ? "text-sm" : "text-xs")}>
            {size === "lg"
              ? "MKV, MP4, MOV, AVI, M4V, WebM, MPEG and more. Select several files to convert in a batch."
              : "MKV, MP4, MOV, AVI, WebM and more"}
          </p>
        </div>
        <div className={cn("flex flex-wrap justify-center gap-2", size === "lg" ? "mt-6" : "mt-3")}>
          <Button
            variant="primary"
            size={size === "lg" ? "md" : "sm"}
            icon={<Film className="size-4" />}
            onClick={() => input.current?.click()}
          >
            Choose files
          </Button>
          {onBrowseLibrary && (
            <Button
              variant="secondary"
              size={size === "lg" ? "md" : "sm"}
              icon={<FolderOpen className="size-4" />}
              onClick={onBrowseLibrary}
            >
              Browse library
            </Button>
          )}
        </div>
      </div>
      {footer && <div className="relative mt-5">{footer}</div>}
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(",") + ",video/*"}
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose movie files"
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function UploadList({ onSelect }: { onSelect?: (mediaId: string) => void }) {
  const { uploads, cancel, dismiss } = useUploads();
  const visible = uploads.filter((u) => u.status !== "done" || !onSelect);
  if (!visible.length) return null;
  return (
    <ul className="space-y-2" aria-label="Imports in progress">
      <AnimatePresence initial={false}>
        {visible.map((u) => (
          <motion.li
            key={u.key}
            layout
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border border-line bg-surface p-3"
          >
            <div className="flex items-center gap-3">
              <div className="shrink-0">
                {u.status === "error" || u.status === "canceled" ? (
                  <AlertCircle className={cn("size-4", u.status === "error" ? "text-danger" : "text-faint")} />
                ) : u.status === "done" ? (
                  <CheckCircle2 className="size-4 text-success" />
                ) : (
                  <Loader2 className="size-4 animate-spin text-accent" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.name}</p>
                <p className="text-xs text-faint">
                  {formatBytes(u.size)} · {extensionOf(u.name).replace(".", "").toUpperCase() || "?"} ·{" "}
                  {u.status === "uploading"
                    ? `Importing ${Math.round(u.progress * 100)}%`
                    : u.status === "analysing"
                      ? "Analysing with FFprobe…"
                      : u.status === "done"
                        ? "Imported"
                        : u.status === "canceled"
                          ? "Canceled"
                          : "Couldn't import"}
                </p>
              </div>
              {u.status === "uploading" || u.status === "analysing" ? (
                <Button variant="ghost" size="sm" onClick={() => cancel(u.key)} disabled={u.status === "analysing"}>
                  Cancel
                </Button>
              ) : (
                <Button variant="ghost" size="icon" aria-label={`Dismiss ${u.name}`} onClick={() => dismiss(u.key)}>
                  <X className="size-4" />
                </Button>
              )}
            </div>
            {(u.status === "uploading" || u.status === "analysing") && (
              <Progress
                className="mt-2.5"
                value={u.status === "analysing" ? null : u.progress * 100}
                label={`Importing ${u.name}`}
              />
            )}
            {u.error && u.status === "error" && <p className="mt-2 text-xs text-danger">{u.error}</p>}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
