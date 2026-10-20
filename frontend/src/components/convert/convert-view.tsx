"use client";

import { Clapperboard, Layers } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { useMedia, useProfiles, useSettings, useSystem } from "@/lib/hooks";
import { omit } from "@/lib/storage";

import { DropZone, UploadList } from "../media/drop-zone";
import { LibraryBrowser } from "../media/library-browser";
import { useJobs } from "../providers/jobs";
import { useUploads } from "../providers/uploads";
import { EngineBanner } from "../shell/engine-banner";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { EmptyState, Skeleton } from "../ui/feedback";
import { MediaList } from "./media-list";
import { Workspace } from "./workspace";

export function ConvertView() {
  const router = useRouter();
  const params = useSearchParams();
  const media = useMedia();
  const profiles = useProfiles();
  const settings = useSettings();
  const system = useSystem();
  const { uploads, lastImported } = useUploads();
  const { byId: jobsById } = useJobs();

  const uploading = uploads.some((u) => u.status === "uploading" || u.status === "analysing");
  const [explicitId, setExplicitId] = useState<string | null>(params.get("media"));
  // While set, the newest finished import is selected automatically.
  const [followSince, setFollowSince] = useState<{ since: string | null } | null>(() =>
    uploading ? { since: lastImported } : null,
  );
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [profileChoice, setProfileChoice] = useState<string | null>(null);
  const [jobFor, setJobFor] = useState<Record<string, string>>({});
  const [batching, setBatching] = useState(false);
  const [browsing, setBrowsing] = useState(false);

  const items = media.data ?? [];
  const exists = (id: string | null | undefined) => (id && items.some((m) => m.id === id) ? id : null);
  const followed = followSince && lastImported !== followSince.since ? lastImported : null;
  const selectedId = exists(explicitId) ?? exists(followed) ?? items[0]?.id ?? null;
  const selected = items.find((m) => m.id === selectedId) ?? null;

  const defaultProfile = settings.data?.default_profile_id;
  const profileId =
    profileChoice ??
    (profiles.data?.some((p) => p.id === defaultProfile) ? defaultProfile! : profiles.data ? "universal" : null);
  const profile = profiles.data?.find((p) => p.id === profileId) ?? null;

  const select = (id: string | null) => {
    setExplicitId(id);
    setFollowSince(null);
  };
  const followUploads = () => {
    setExplicitId(null);
    setFollowSince({ since: lastImported });
  };

  const queueBatch = async () => {
    if (!profileId) return;
    setBatching(true);
    try {
      const result = await api.createBatch([...checked], profileId, { mode: "recommended" });
      if (result.created.length) {
        toast.success(`${result.created.length} movie${result.created.length > 1 ? "s" : ""} added to the queue`);
      }
      for (const s of result.skipped) toast.message(`Skipped ${s.name ?? "a movie"}`, { description: s.reason });
      setChecked(new Set());
      if (result.created.length) router.push("/queue");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBatching(false);
    }
  };

  if (media.isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Skeleton className="h-72" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const libraryBrowser = (
    <LibraryBrowser
      open={browsing}
      onOpenChange={setBrowsing}
      onImported={(m) => {
        setBrowsing(false);
        select(m.id);
      }}
    />
  );

  if (!items.length && !uploading) {
    return (
      <div className="space-y-6">
        <EngineBanner />
        <Card className="p-2">
          <EmptyState
            icon={<Clapperboard className="size-5" />}
            title="Choose a movie to start"
            description="Import a movie file to see what's inside it and what your TV might struggle with. Nothing is changed until you start a conversion."
          />
          <div className="px-4 pb-4 sm:px-8 sm:pb-8">
            <DropZone onFilesAdded={followUploads} onBrowseLibrary={() => setBrowsing(true)} footer={<UploadList />} />
          </div>
        </Card>
        {libraryBrowser}
      </div>
    );
  }

  const job = selectedId && jobFor[selectedId] ? jobsById[jobFor[selectedId]] : undefined;

  return (
    <div className="space-y-6">
      <EngineBanner />

      <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-3 lg:sticky lg:top-24">
          <DropZone size="sm" onFilesAdded={followUploads} onBrowseLibrary={() => setBrowsing(true)} />
          <UploadList onSelect={select} />
          <MediaList items={items} selectedId={selectedId} onSelect={select} checked={checked} onCheckedChange={setChecked} />
          {checked.size > 0 && (
            <Card className="space-y-3 p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Layers className="size-4 text-accent" /> Batch: {checked.size} selected
              </p>
              <p className="text-xs leading-relaxed text-muted">
                Each movie gets its own recommendation for{" "}
                <span className="text-fg">{profile?.name ?? "the selected profile"}</span>. Movies that don&apos;t need
                converting are skipped.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" loading={batching} onClick={queueBatch}>
                  Queue {checked.size}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setChecked(new Set())}>
                  Clear
                </Button>
              </div>
            </Card>
          )}
        </aside>

        {selected && selected.info && settings.data && profiles.data ? (
          <Workspace
            key={selected.id}
            media={selected}
            info={selected.info}
            profiles={profiles.data}
            profileId={profileId}
            onProfileChange={setProfileChoice}
            prefs={settings.data}
            system={system.data}
            job={job}
            onJobCreated={(id) => setJobFor((m) => ({ ...m, [selected.id]: id }))}
            onConvertAnother={() => {
              setJobFor((m) => omit(m, selected.id));
              select(items.find((m) => m.id !== selected.id)?.id ?? null);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        ) : selected ? (
          <Skeleton className="h-96" />
        ) : (
          <Card className="p-2">
            <EmptyState icon={<Clapperboard className="size-5" />} title="Select a movie" description="Choose a movie on the left to analyse it." />
          </Card>
        )}
      </div>
      {libraryBrowser}
    </div>
  );
}
