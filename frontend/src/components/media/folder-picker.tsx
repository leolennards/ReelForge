"use client";

import { ChevronLeft, Folder, FolderCheck } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import type { DirListing } from "@/lib/types";

import { Button } from "../ui/button";
import { Callout, Skeleton } from "../ui/feedback";
import { Dialog } from "../ui/overlays";

/**
 * Browsers can't hand a folder's real location to a web page, so the folder
 * list comes from the local engine, limited to REELFORGE_OUTPUT_ROOTS.
 */
export function FolderPicker({
  open,
  onOpenChange,
  initialPath,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPath?: string | null;
  onPick: (path: string) => void;
}) {
  const [path, setPath] = useState<string | null>(initialPath ?? null);
  const { data, error } = useSWR<DirListing>(
    open ? `/api/fs/dirs${path ? `?path=${encodeURIComponent(path)}` : ""}` : null,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Choose output folder"
      description="Converted movies are saved here. The folder is created if it doesn't exist yet."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<FolderCheck className="size-4" />}
            disabled={!data?.path}
            onClick={() => {
              if (data?.path) onPick(data.path);
              onOpenChange(false);
            }}
          >
            Use this folder
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<ChevronLeft className="size-4" />}
            disabled={!data?.path}
            onClick={() => setPath(data?.parent ?? null)}
          >
            Up
          </Button>
          <p className="truncate font-mono text-xs text-faint">{data?.path ?? "Allowed locations"}</p>
        </div>
        {error ? (
          <Callout tone="danger" title="This folder can't be opened">
            {(error as Error).message}
          </Callout>
        ) : !data ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : data.dirs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No sub-folders. You can use this folder.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {data.dirs.map((d) => (
              <li key={d.path}>
                <button
                  type="button"
                  onClick={() => setPath(d.path)}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm hover:bg-surface-hover"
                >
                  <Folder className="size-4 text-faint" />
                  <span className="truncate">{d.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
