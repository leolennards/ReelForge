"use client";

import { Copy, Pencil, Plus, Trash2, Tv, Usb } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";

import { api } from "@/lib/api";
import { useProfiles, useSettings } from "@/lib/hooks";
import type { DeviceProfile } from "@/lib/types";

import { UsbGuide } from "../media/usb-guide";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardBody, CardHeader } from "../ui/card";
import { Callout, Skeleton } from "../ui/feedback";
import { ConfirmDialog } from "../ui/overlays";
import { ProfileEditor } from "./profile-editor";

const upper = (list: string[]) => list.map((c) => c.toUpperCase()).join(", ");

function ProfileCard({
  profile,
  isDefault,
  onDuplicate,
  onEdit,
  onDelete,
}: {
  profile: DeviceProfile;
  isDefault: boolean;
  onDuplicate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3 p-5">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Tv className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold tracking-tight">{profile.name}</h3>
            {profile.builtin ? <Badge>Preset</Badge> : <Badge tone="accent">Custom</Badge>}
            {isDefault && <Badge tone="success">Default</Badge>}
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{profile.description || "No description."}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line px-5 py-4 text-xs">
        <div>
          <dt className="text-faint">Containers</dt>
          <dd className="mt-0.5">{upper(profile.containers)}</dd>
        </div>
        <div>
          <dt className="text-faint">Max resolution</dt>
          <dd className="mt-0.5">
            {profile.max_width}×{profile.max_height}
          </dd>
        </div>
        <div>
          <dt className="text-faint">Video</dt>
          <dd className="mt-0.5">
            {upper(profile.video_codecs)}
            {profile.video_uncertain.length > 0 && <span className="text-warning"> · unsure: {upper(profile.video_uncertain)}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-faint">Audio</dt>
          <dd className="mt-0.5">
            {upper(profile.audio_codecs)}
            {profile.audio_uncertain.length > 0 && <span className="text-warning"> · unsure: {upper(profile.audio_uncertain)}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-faint">Converts audio to</dt>
          <dd className="mt-0.5">
            {profile.preferred_audio_codec.toUpperCase()}, up to {profile.max_audio_channels} channels
          </dd>
        </div>
        <div>
          <dt className="text-faint">When unsure</dt>
          <dd className="mt-0.5">{profile.priority === "quality" ? "Keep quality" : "Maximise compatibility"}</dd>
        </div>
      </dl>
      {profile.notes.length > 0 && (
        <ul className="mx-5 mb-4 space-y-1 rounded-lg bg-sunken/60 p-3 text-xs leading-relaxed text-muted">
          {profile.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap gap-2 border-t border-line p-4">
        <Button size="sm" variant="secondary" icon={<Copy className="size-4" />} onClick={onDuplicate}>
          Duplicate & customise
        </Button>
        {!profile.builtin && (
          <>
            <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={onEdit}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={onDelete} className="ml-auto text-danger">
              Delete
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

export function ProfilesView() {
  const profiles = useProfiles();
  const settings = useSettings();
  const [editorOpen, setEditorOpen] = useState(false);
  const [base, setBase] = useState<DeviceProfile | null>(null);
  const [deleting, setDeleting] = useState<DeviceProfile | null>(null);
  const ids = (profiles.data ?? []).map((p) => p.id);

  const openEditor = (profile: DeviceProfile | null) => {
    setBase(profile);
    setEditorOpen(true);
  };

  return (
    <div className="space-y-6">
      <Callout tone="info" title="Profiles are general guides, not guarantees">
        What a TV plays depends on its exact model, model year, firmware, the container and the codec profile. If you
        don&apos;t know your TV model, use <span className="text-fg">Universal USB Playback</span>. It favours the
        most broadly supported formats.
      </Callout>

      <div className="flex justify-end">
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openEditor(null)}>
          New custom profile
        </Button>
      </div>

      {profiles.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      ) : profiles.error ? (
        <Callout tone="danger" title="Profiles couldn't be loaded">
          {(profiles.error as Error).message}
        </Callout>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(profiles.data ?? []).map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              isDefault={settings.data?.default_profile_id === p.id}
              onDuplicate={() => openEditor(p)}
              onEdit={() => openEditor(p)}
              onDelete={() => setDeleting(p)}
            />
          ))}
        </div>
      )}

      <Card id="usb">
        <CardHeader
          title="USB drive guide"
          description="Which filesystem to use, and a checklist before you sit down to watch."
          icon={<Usb className="size-4" />}
        />
        <CardBody>
          <UsbGuide />
        </CardBody>
      </Card>

      <ProfileEditor open={editorOpen} onOpenChange={setEditorOpen} base={base} existingIds={ids} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description="The profile is removed from this computer. Past conversions that used it are not affected."
        confirmLabel="Delete profile"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api.deleteProfile(deleting.id);
            await mutate("/api/profiles");
            mutate("/api/settings");
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />
    </div>
  );
}
