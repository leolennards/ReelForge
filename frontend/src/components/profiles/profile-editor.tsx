"use client";

import { useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";

import { api } from "@/lib/api";
import type { CodecOption, DeviceProfile, ProfileOptions } from "@/lib/types";

import { Button } from "../ui/button";
import { Callout } from "../ui/feedback";
import { Checkbox, Field, Input, Segmented, Select } from "../ui/form";
import { Dialog } from "../ui/overlays";

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "custom"
  );
}

function CodecChecklist({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  label: string;
  options: CodecOption[];
  value: string[];
  onChange: (next: string[]) => void;
  hint?: string;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-[13px] font-medium">{label}</legend>
      {hint && <p className="text-xs text-faint">{hint}</p>}
      <div className="grid grid-cols-1 gap-x-2 rounded-xl border border-line bg-sunken/50 p-1.5 sm:grid-cols-2">
        {options.map((o) => (
          <Checkbox
            key={o.id}
            label={o.label}
            checked={value.includes(o.id)}
            onChange={(on) => onChange(on ? [...value, o.id] : value.filter((v) => v !== o.id))}
          />
        ))}
      </div>
    </fieldset>
  );
}

const RESOLUTIONS = [
  { value: "3840x2160", label: "4K (3840×2160)" },
  { value: "2560x1440", label: "1440p (2560×1440)" },
  { value: "1920x1080", label: "1080p (1920×1080)" },
  { value: "1280x720", label: "720p (1280×720)" },
];

export function ProfileEditor({
  open,
  onOpenChange,
  base,
  existingIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  base: DeviceProfile | null;
  existingIds: string[];
}) {
  const options = useSWR<ProfileOptions>(open ? "/api/profiles/options" : null);
  if (!open || !options.data) return null;
  const initial: DeviceProfile = base
    ? base.builtin
      ? { ...base, id: "", name: `${base.name} (custom)`, builtin: false, notes: [] }
      : { ...base }
    : { ...options.data.template, id: "", name: "My TV" };
  return (
    <ProfileForm
      key={base?.id ?? "new"}
      onOpenChange={onOpenChange}
      initial={initial}
      editing={!!base && !base.builtin}
      title={base && !base.builtin ? `Edit ${base.name}` : "Create a custom profile"}
      opts={options.data}
      existingIds={existingIds}
    />
  );
}

function ProfileForm({
  onOpenChange,
  initial,
  editing,
  title,
  opts,
  existingIds,
}: {
  onOpenChange: (open: boolean) => void;
  initial: DeviceProfile;
  editing: boolean;
  title: string;
  opts: ProfileOptions;
  existingIds: string[];
}) {
  const [draft, setDraft] = useState<DeviceProfile>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<DeviceProfile>) => setDraft((d) => ({ ...d, ...patch }));
  const audioChoices = (["aac", "ac3", "eac3", "mp3"] as const).filter((c) => draft.audio_codecs.includes(c));
  const videoChoices = (["h264", "hevc"] as const).filter((c) => draft.video_codecs.includes(c));
  const containerChoices = (["mp4", "mkv"] as const).filter((c) => draft.containers.includes(c));

  const save = async () => {
    setError(null);
    if (!containerChoices.length || !videoChoices.length || !audioChoices.length) {
      setError(
        "Select MP4 or MKV as a container, H.264 or HEVC as a video codec, and at least one of AAC, AC-3, E-AC-3 or MP3, so ReelForge has something to convert to.",
      );
      return;
    }
    const preferred = {
      preferred_container: containerChoices.includes(draft.preferred_container) ? draft.preferred_container : containerChoices[0],
      preferred_video_codec: videoChoices.includes(draft.preferred_video_codec) ? draft.preferred_video_codec : videoChoices[0],
      preferred_audio_codec: audioChoices.includes(draft.preferred_audio_codec) ? draft.preferred_audio_codec : audioChoices[0],
    };
    let id = draft.id || slugify(draft.name);
    if (!editing) {
      let n = 2;
      const base = id;
      while (existingIds.includes(id)) id = `${base}-${n++}`;
    }
    setSaving(true);
    try {
      const saved = await api.saveProfile({ ...draft, ...preferred, id, builtin: false });
      await mutate("/api/profiles");
      toast.success(`Saved “${saved.name}”`);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      size="lg"
      title={title}
      description="Describe what your TV is known to play. Check the manual or the manufacturer's support page for your exact model."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={save} disabled={!draft.name.trim()}>
            Save profile
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {error && <Callout tone="danger" title="This profile can't be saved">{error}</Callout>}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name" htmlFor="profile-name">
            <Input id="profile-name" value={draft.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Description" htmlFor="profile-desc">
            <Input
              id="profile-desc"
              value={draft.description}
              maxLength={400}
              placeholder="e.g. Living room TV, 2021 model"
              onChange={(e) => set({ description: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <CodecChecklist
            label="Supported containers"
            options={opts.containers}
            value={draft.containers}
            onChange={(containers) => set({ containers })}
          />
          <CodecChecklist
            label="Supported video codecs"
            options={opts.video_codecs}
            value={draft.video_codecs}
            onChange={(video_codecs) => set({ video_codecs, video_uncertain: draft.video_uncertain.filter((c) => !video_codecs.includes(c)) })}
          />
          <CodecChecklist
            label="Supported audio codecs"
            options={opts.audio_codecs}
            value={draft.audio_codecs}
            onChange={(audio_codecs) => set({ audio_codecs, audio_uncertain: draft.audio_uncertain.filter((c) => !audio_codecs.includes(c)) })}
          />
          <CodecChecklist
            label="Embedded subtitles it shows"
            hint="Leave empty if unsure; ReelForge will then suggest a separate .srt file."
            options={opts.subtitle_codecs}
            value={draft.subtitle_codecs}
            onChange={(subtitle_codecs) => set({ subtitle_codecs })}
          />
      </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Preferred output container">
            <Select
              ariaLabel="Preferred container"
              value={containerChoices.includes(draft.preferred_container) ? draft.preferred_container : (containerChoices[0] ?? "mp4")}
              onChange={(preferred_container) => set({ preferred_container })}
              options={(containerChoices.length ? containerChoices : (["mp4"] as const)).map((c) => ({ value: c, label: c.toUpperCase() }))}
            />
          </Field>
          <Field label="Video codec when re-encoding">
            <Select
              ariaLabel="Preferred video codec"
              value={videoChoices.includes(draft.preferred_video_codec) ? draft.preferred_video_codec : (videoChoices[0] ?? "h264")}
              onChange={(preferred_video_codec) => set({ preferred_video_codec })}
              options={(videoChoices.length ? videoChoices : (["h264"] as const)).map((c) => ({ value: c, label: c === "h264" ? "H.264" : "H.265 (HEVC)" }))}
            />
          </Field>
          <Field label="Preferred audio codec">
            <Select
              ariaLabel="Preferred audio codec"
              value={audioChoices.includes(draft.preferred_audio_codec) ? draft.preferred_audio_codec : (audioChoices[0] ?? "aac")}
              onChange={(preferred_audio_codec) => set({ preferred_audio_codec })}
              options={(audioChoices.length ? audioChoices : (["aac"] as const)).map((c) => ({ value: c, label: c.toUpperCase() }))}
            />
          </Field>
          <Field label="Maximum resolution">
            <Select
              ariaLabel="Maximum resolution"
              value={`${draft.max_width}x${draft.max_height}`}
              onChange={(v) => {
                const [w, h] = v.split("x").map(Number);
                set({ max_width: w, max_height: h });
              }}
              options={RESOLUTIONS}
            />
          </Field>
          <Field label="Maximum audio channels" hint="Audio with more channels is downmixed.">
            <Select
              ariaLabel="Maximum audio channels"
              value={String(draft.max_audio_channels)}
              onChange={(v) => set({ max_audio_channels: Number(v) })}
              options={[
                { value: "2", label: "Stereo (2)" },
                { value: "6", label: "5.1 (6)" },
                { value: "8", label: "7.1 (8)" },
              ]}
            />
          </Field>
          <Field label="Subtitles">
            <Select
              ariaLabel="Subtitle preference"
              value={draft.subtitle_preference}
              onChange={(subtitle_preference) => set({ subtitle_preference })}
              options={[
                { value: "keep_compatible", label: "Keep all that fit" },
                { value: "first_only", label: "Main subtitle only" },
                { value: "none", label: "No subtitles" },
              ]}
            />
          </Field>
        </div>

        <Field label="When unsure" hint="Quality keeps uncertain video untouched; compatibility re-encodes it to be safe.">
          <Segmented
            ariaLabel="Priority"
            value={draft.priority}
            onChange={(priority) => set({ priority })}
            options={[
              { value: "quality", label: "Prioritise quality" },
              { value: "compatibility", label: "Prioritise compatibility" },
            ]}
          />
        </Field>
      </div>
    </Dialog>
  );
}
