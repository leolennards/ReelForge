"use client";

import { ChevronLeft, Film, Folder, FolderOpen } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";

import { api } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import type { LibraryListing, LibraryRoot, MediaItem } from "@/lib/types";

import { Button } from "../ui/button";
import { Callout, EmptyState, Skeleton } from "../ui/feedback";
import { Select } from "../ui/form";
import { Dialog } from "../ui/overlays";

/**
 * Converting from the library reads the movie where it already is, so large
 * files don't need to be copied through the browser first.
 */
export function LibraryBrowser({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (media: MediaItem) => void;
}) {
  const roots = useSWR<LibraryRoot[]>(open ? "/api/library/roots" : null);
  const [root, setRoot] = useState(0);
  const [path, setPath] = useState("");
  const listing = useSWR<LibraryListing>(
    open ? `/api/library/browse?root=${root}&path=${encodeURIComponent(path)}` : null,
  );
  const [importing, setImporting] = useState<string | null>(null);

  const importFile = async (filePath: string) => {
    setImporting(filePath);
    try {
      const media = await api.importLibrary(root, filePath);
      await mutate("/api/media");
      toast.success(`Imported ${media.name}`, { description: "Analysed and ready to convert." });
      onImported(media);
    } catch (err) {
      toast.error("Couldn't import this file", { description: (err as Error).message });
    } finally {
      setImporting(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Browse your movie folders"
      description="Pick a movie to analyse it where it is. The original file is never changed."
    >
      <div className="space-y-4">
        {roots.data && roots.data.length > 1 && (
          <Select
            ariaLabel="Library folder"
            value={String(root)}
            onChange={(v) => {
              setRoot(Number(v));
              setPath("");
            }}
            options={roots.data.map((r) => ({ value: String(r.id), label: r.path }))}
          />
        )}
        <div className="flex items-center gap-2 text-sm">
          <Button
            variant="ghost"
            size="sm"
            icon={<ChevronLeft className="size-4" />}
            disabled={listing.data?.parent == null}
            onClick={() => setPath(listing.data?.parent ?? "")}
          >
            Up
          </Button>
          <p className="truncate font-mono text-xs text-faint">
            {roots.data?.[root]?.path}
            {path ? `/${path}` : ""}
          </p>
        </div>
        {listing.error ? (
          <Callout tone="danger" title="This folder can't be opened">
            {(listing.error as Error).message}
          </Callout>
        ) : !listing.data ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : listing.data.dirs.length + listing.data.files.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="size-5" />}
            title="No movies here"
            description="This folder has no sub-folders or supported movie files."
          />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {listing.data.dirs.map((d) => (
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
            {listing.data.files.map((f) => (
              <li key={f.path} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                <Film className="size-4 text-accent" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-faint">{formatBytes(f.size)}</span>
                <Button
                  size="sm"
                  variant="primary"
                  loading={importing === f.path}
                  disabled={importing !== null}
                  onClick={() => importFile(f.path)}
                >
                  Import
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-faint">
          Only folders set in <code className="font-mono">REELFORGE_MEDIA_DIRS</code> are available. Browsers can&apos;t
          share a file&apos;s location with web pages, so this list comes from ReelForge&apos;s local engine instead.
        </p>
      </div>
    </Dialog>
  );
}
