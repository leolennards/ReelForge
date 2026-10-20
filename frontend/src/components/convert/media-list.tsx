"use client";

import { Film, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";

import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatBytes, formatRuntime } from "@/lib/format";
import type { MediaItem } from "@/lib/types";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ConfirmDialog, Tooltip } from "../ui/overlays";

export function MediaList({
  items,
  selectedId,
  onSelect,
  checked,
  onCheckedChange,
}: {
  items: MediaItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  checked: Set<string>;
  onCheckedChange: (next: Set<string>) => void;
}) {
  const [removing, setRemoving] = useState<MediaItem | null>(null);

  return (
    <>
      <ul className="space-y-2" aria-label="Imported movies">
        <AnimatePresence initial={false}>
          {items.map((m) => {
            const selected = m.id === selectedId;
            const video = m.info?.video.find((v) => v.index === m.info?.primary_video);
            return (
              <motion.li
                key={m.id}
                layout
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl border p-3 transition-colors",
                  selected ? "border-accent/40 bg-accent-soft" : "border-line bg-surface hover:border-line-strong",
                )}
              >
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-[var(--accent-strong)]"
                  aria-label={`Include ${m.name} in batch`}
                  checked={checked.has(m.id)}
                  onChange={(e) => {
                    const next = new Set(checked);
                    if (e.target.checked) next.add(m.id);
                    else next.delete(m.id);
                    onCheckedChange(next);
                  }}
                />
                <button
                  type="button"
                  onClick={() => onSelect(m.id)}
                  className="min-w-0 flex-1 text-left after:absolute after:inset-0 after:content-['']"
                  aria-current={selected ? "true" : undefined}
                >
                  <p className="flex items-center gap-2 truncate text-sm font-medium">
                    <Film className="size-3.5 shrink-0 text-faint" />
                    <span className="truncate">{m.name}</span>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-faint">
                    {formatBytes(m.size)} · {m.extension.replace(".", "").toUpperCase()}
                    {m.info ? ` · ${formatRuntime(m.info.duration)}` : ""}
                    {video?.height ? ` · ${video.height}p` : ""}
                  </p>
                </button>
                <Badge className="relative hidden xl:inline-flex">{m.source_kind === "library" ? "In place" : "Copy"}</Badge>
                <Tooltip content="Remove from list">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative size-8 opacity-70 group-hover:opacity-100"
                    aria-label={`Remove ${m.name} from list`}
                    onClick={() => setRemoving(m)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </Tooltip>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this movie from the list?"
        description={
          removing?.source_kind === "library"
            ? "It is only removed from ReelForge's list. The original file stays exactly where it is."
            : "ReelForge's imported copy is deleted. Your original file on your computer is not affected."
        }
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!removing) return;
          try {
            await api.removeMedia(removing.id);
            await mutate("/api/media");
            const next = new Set(checked);
            next.delete(removing.id);
            onCheckedChange(next);
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />
    </>
  );
}
