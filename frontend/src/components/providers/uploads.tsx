"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { mutate } from "swr";

import { uploadFile, type UploadHandle } from "@/lib/api";
import type { MediaItem } from "@/lib/types";

export const ACCEPTED_EXTENSIONS = [".mkv", ".mp4", ".mov", ".avi", ".m4v", ".webm", ".mpg", ".mpeg", ".ts", ".m2ts", ".wmv"];

export interface Upload {
  key: string;
  name: string;
  size: number;
  progress: number;
  status: "uploading" | "analysing" | "done" | "error" | "canceled";
  error?: string;
  media?: MediaItem;
}

interface UploadsContextValue {
  uploads: Upload[];
  /** Media id of the most recently finished import. */
  lastImported: string | null;
  addFiles: (files: FileList | File[]) => Upload[];
  cancel: (key: string) => void;
  dismiss: (key: string) => void;
}

const UploadsContext = createContext<UploadsContextValue | null>(null);

export function extensionOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

/**
 * Uploads run one at a time in the background and survive page navigation,
 * so a movie dropped on the dashboard keeps uploading while you continue.
 */
export function UploadsProvider({ children }: { children: ReactNode }) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [lastImported, setLastImported] = useState<string | null>(null);
  const handles = useRef(new Map<string, UploadHandle>());
  const queue = useRef<{ key: string; file: File }[]>([]);
  const busy = useRef(false);

  const patch = useCallback((key: string, update: Partial<Upload>) => {
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...update } : u)));
  }, []);

  // Processes the queue one upload at a time until it is empty.
  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      let next = queue.current.shift();
      while (next) {
        const { key, file } = next;
        const handle = uploadFile(file, (fraction) => {
          patch(key, { progress: fraction, status: fraction >= 1 ? "analysing" : "uploading" });
        });
        handles.current.set(key, handle);
        try {
          const media = await handle.promise;
          patch(key, { status: "done", progress: 1, media });
          setLastImported(media.id);
          mutate("/api/media");
          mutate("/api/stats");
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload failed.";
          const canceled = message === "Upload canceled.";
          patch(key, { status: canceled ? "canceled" : "error", error: message });
          if (!canceled) toast.error(`Couldn't import ${file.name}`, { description: message });
        } finally {
          handles.current.delete(key);
        }
        next = queue.current.shift();
      }
    } finally {
      busy.current = false;
    }
  }, [patch]);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const added: Upload[] = [];
      for (const file of Array.from(files)) {
        const key = `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const ext = extensionOf(file.name);
        if (!ACCEPTED_EXTENSIONS.includes(ext)) {
          const item: Upload = {
            key,
            name: file.name,
            size: file.size,
            progress: 0,
            status: "error",
            error: `${ext || "Files without an extension"} aren't supported. Choose a movie file such as MKV or MP4.`,
          };
          added.push(item);
          continue;
        }
        added.push({ key, name: file.name, size: file.size, progress: 0, status: "uploading" });
        queue.current.push({ key, file });
      }
      setUploads((list) => [...added, ...list]);
      void pump();
      return added;
    },
    [pump],
  );

  const cancel = useCallback(
    (key: string) => {
      const queued = queue.current.findIndex((q) => q.key === key);
      if (queued >= 0) {
        queue.current.splice(queued, 1);
        patch(key, { status: "canceled", error: "Upload canceled." });
        return;
      }
      handles.current.get(key)?.abort();
    },
    [patch],
  );

  const dismiss = useCallback((key: string) => {
    setUploads((list) => list.filter((u) => u.key !== key));
  }, []);

  const value = useMemo(
    () => ({ uploads, lastImported, addFiles, cancel, dismiss }),
    [uploads, lastImported, addFiles, cancel, dismiss],
  );
  return <UploadsContext.Provider value={value}>{children}</UploadsContext.Provider>;
}

export function useUploads() {
  const ctx = useContext(UploadsContext);
  if (!ctx) throw new Error("useUploads must be used inside UploadsProvider");
  return ctx;
}
