"use client";

import { Cpu, FolderOpen, Gauge, HardDrive, Palette, RefreshCw, RotateCcw, Shield, SlidersHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { mutate } from "swr";

import { api } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { omit } from "@/lib/storage";
import { useProfiles, useSettings, useSystem } from "@/lib/hooks";
import type { AppSettings } from "@/lib/types";

import { FolderPicker } from "../media/folder-picker";
import { useTheme } from "../providers/theme";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardBody, CardHeader } from "../ui/card";
import { Callout, Skeleton } from "../ui/feedback";
import { Field, Input, Segmented, Select, Switch } from "../ui/form";
import { ConfirmDialog } from "../ui/overlays";

function Section({ title, description, icon, children }: { title: string; description?: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} icon={icon} />
      <CardBody className="space-y-5">{children}</CardBody>
    </Card>
  );
}

export function SettingsView() {
  const settings = useSettings();
  const profiles = useProfiles();
  const system = useSystem();
  const { choice: themeChoice, setChoice } = useTheme();
  // Unsaved edits; null means "showing what's saved".
  const [edits, setEdits] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [checking, setChecking] = useState(false);

  const draft = edits ?? settings.data ?? null;
  const setDraft = setEdits;

  if (settings.error) {
    return (
      <Callout tone="danger" title="Settings couldn't be loaded">
        {(settings.error as Error).message}
      </Callout>
    );
  }
  if (!draft) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    );
  }

  const dirty = edits !== null && JSON.stringify(edits) !== JSON.stringify(settings.data);
  const set = (patch: Partial<AppSettings>) => setDraft({ ...draft, ...patch });
  const hardware = system.data?.ffmpeg.hardware_encoders ?? [];

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.saveSettings(omit(draft, "effective_output_dir") as AppSettings);
      await mutate("/api/settings", saved, { revalidate: false });
      setEdits(null);
      setChoice(saved.theme);
      mutate("/api/system");
      toast.success("Settings saved");
    } catch (err) {
      toast.error("Settings weren't saved", { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <Section title="Appearance" icon={<Palette className="size-4" />}>
        <Field label="Theme">
          <Segmented
            ariaLabel="Theme"
            value={themeChoice}
            onChange={(theme) => {
              set({ theme });
              setChoice(theme);
            }}
            options={[
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
              { value: "system", label: "Match system" },
            ]}
          />
        </Field>
      </Section>

      <Section title="Conversion defaults" description="Used as the starting point for every new conversion." icon={<SlidersHorizontal className="size-4" />}>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Default device profile">
            <Select
              ariaLabel="Default device profile"
              value={draft.default_profile_id}
              onChange={(default_profile_id) => set({ default_profile_id })}
              options={(profiles.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
          <Field label="Default audio format" hint="Used when audio has to be converted.">
            <Select
              ariaLabel="Default audio format"
              value={draft.default_audio_codec}
              onChange={(default_audio_codec) => set({ default_audio_codec })}
              options={[
                { value: "auto", label: "Profile's choice" },
                { value: "aac", label: "AAC" },
                { value: "ac3", label: "Dolby Digital (AC-3)" },
                { value: "eac3", label: "Dolby Digital Plus (E-AC-3)" },
              ]}
            />
          </Field>
          <Field label="Default video quality" hint="When the video has to be re-encoded.">
            <Select
              ariaLabel="Default video quality"
              value={draft.default_quality}
              onChange={(default_quality) => set({ default_quality })}
              options={[
                { value: "high", label: "High" },
                { value: "balanced", label: "Balanced" },
                { value: "compact", label: "Compact" },
              ]}
            />
          </Field>
        </div>
        <Field label="Processing behaviour">
          <Segmented
            ariaLabel="Processing behaviour"
            value={draft.processing_behaviour}
            onChange={(processing_behaviour) => set({ processing_behaviour })}
            options={[
              { value: "smallest_change", label: "Smallest necessary change" },
              { value: "max_compatibility", label: "Always maximise compatibility" },
            ]}
          />
        </Field>
        <p className="-mt-3 text-xs leading-relaxed text-faint">
          “Smallest necessary change” keeps the original video whenever possible. “Always maximise compatibility”
          re-encodes the video every time; it is slower and slightly reduces quality.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Switch
            checked={draft.hardware_acceleration}
            onChange={(hardware_acceleration) => set({ hardware_acceleration })}
            disabled={!hardware.length}
            label="Use hardware acceleration by default"
            description={hardware.length ? `Available: ${hardware.join(", ")}` : "No working hardware encoder was detected."}
          />
          <Switch
            checked={draft.external_srt}
            onChange={(external_srt) => set({ external_srt })}
            label="Save a separate .srt subtitle file by default"
            description="When the movie has text subtitles."
          />
          <Switch
            checked={draft.usb_size_check}
            onChange={(usb_size_check) => set({ usb_size_check })}
            label="Warn when a file is too large for FAT32"
            description="Shown in the TV Ready Check for files of 4 GiB or more."
          />
        </div>
      </Section>

      <Section title="Output" icon={<FolderOpen className="size-4" />}>
        <Field label="Default output folder" hint={`Allowed locations: ${system.data?.output_roots.join(", ") ?? "…"}`}>
          <div className="flex gap-2">
            <Input value={draft.output_dir ?? draft.effective_output_dir ?? ""} readOnly className="font-mono text-xs" />
            <Button variant="secondary" onClick={() => setPicker(true)}>
              Change
            </Button>
            {draft.output_dir && (
              <Button variant="ghost" onClick={() => set({ output_dir: null })}>
                Use default
              </Button>
            )}
          </div>
        </Field>
        {system.data?.output_free_bytes != null && (
          <p className="flex items-center gap-2 text-xs text-muted">
            <HardDrive className="size-3.5" /> {formatBytes(system.data.output_free_bytes)} free on this drive
          </p>
        )}
      </Section>

      <Section title="Queue" icon={<Gauge className="size-4" />}>
        <Field
          label="Conversions at the same time"
          hint="One at a time is recommended. Running several in parallel rarely finishes sooner and can make your computer sluggish."
        >
          <Segmented
            ariaLabel="Maximum concurrent jobs"
            value={String(draft.max_concurrent_jobs)}
            onChange={(v) => set({ max_concurrent_jobs: Number(v) })}
            options={["1", "2", "3", "4"].map((v) => ({ value: v, label: v }))}
          />
        </Field>
      </Section>

      <Section title="Privacy and history" icon={<Shield className="size-4" />}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Keep conversion history">
            <Select
              ariaLabel="History retention"
              value={String(draft.history_retention_days)}
              onChange={(v) => set({ history_retention_days: Number(v) as AppSettings["history_retention_days"] })}
              options={[
                { value: "0", label: "Until I clear it" },
                { value: "7", label: "7 days" },
                { value: "30", label: "30 days" },
                { value: "90", label: "90 days" },
                { value: "365", label: "1 year" },
              ]}
            />
          </Field>
          <Field label="Forget full file paths after" hint="After this, records keep only file names.">
            <Select
              ariaLabel="Path retention"
              value={String(draft.path_retention_days)}
              onChange={(v) => set({ path_retention_days: Number(v) as AppSettings["path_retention_days"] })}
              options={[
                { value: "1", label: "1 day" },
                { value: "7", label: "7 days" },
                { value: "30", label: "30 days" },
              ]}
            />
          </Field>
        </div>
        <Switch
          checked={draft.delete_uploads_after_success}
          onChange={(delete_uploads_after_success) => set({ delete_uploads_after_success })}
          label="Delete imported copies after a successful conversion"
          description="Only ReelForge's own copies of files added by drag and drop. Your originals are never deleted."
        />
      </Section>

      <Section title="System" icon={<Cpu className="size-4" />}>
        {system.data ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={system.data.ffmpeg.available ? "success" : "warning"}>
                FFmpeg {system.data.ffmpeg.available ? "ready" : "not found"}
              </Badge>
              {system.data.ffmpeg.version && <Badge>version {system.data.ffmpeg.version}</Badge>}
              <Badge>ReelForge {system.data.version}</Badge>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                loading={checking}
                icon={<RefreshCw className="size-4" />}
                onClick={async () => {
                  setChecking(true);
                  try {
                    await api.recheckFfmpeg();
                    await mutate("/api/system");
                    toast.success("FFmpeg status refreshed");
                  } catch (err) {
                    toast.error((err as Error).message);
                  } finally {
                    setChecking(false);
                  }
                }}
              >
                Check again
              </Button>
            </div>
            {system.data.ffmpeg.install_hint && <Callout tone="warning">{system.data.ffmpeg.install_hint}</Callout>}
            <dl className="grid gap-3 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-faint">Video encoders</dt>
                <dd className="mt-0.5 font-mono">{system.data.ffmpeg.video_encoders.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-faint">Audio encoders</dt>
                <dd className="mt-0.5 font-mono">{system.data.ffmpeg.audio_encoders.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-faint">Movie folders</dt>
                <dd className="mt-0.5 font-mono break-all">{system.data.media_dirs.join(", ")}</dd>
              </div>
              <div>
                <dt className="text-faint">Data folder</dt>
                <dd className="mt-0.5 font-mono break-all">{system.data.data_dir}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <Skeleton className="h-24" />
        )}
      </Section>

      <Card className="flex flex-wrap items-center gap-3 p-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Reset to defaults</p>
          <p className="text-xs text-muted">Restores every setting on this page. History and profiles are kept.</p>
        </div>
        <Button variant="danger" icon={<RotateCcw className="size-4" />} onClick={() => setResetting(true)}>
          Reset settings
        </Button>
      </Card>

      {dirty && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-2xl border border-line-strong bg-glass p-2.5 pl-4 shadow-2xl backdrop-blur-xl">
            <span className="text-sm">You have unsaved changes</span>
            <Button variant="ghost" size="sm" onClick={() => {
                setEdits(null);
                if (settings.data) setChoice(settings.data.theme);
              }}>
              Discard
            </Button>
            <Button variant="primary" size="sm" loading={saving} onClick={save}>
              Save changes
            </Button>
          </div>
        </div>
      )}

      <FolderPicker
        open={picker}
        onOpenChange={setPicker}
        initialPath={draft.output_dir ?? draft.effective_output_dir}
        onPick={(output_dir) => set({ output_dir })}
      />
      <ConfirmDialog
        open={resetting}
        onOpenChange={setResetting}
        title="Reset all settings?"
        description="Every setting returns to its default value. Conversion history and custom profiles are not affected."
        confirmLabel="Reset settings"
        onConfirm={async () => {
          try {
            const saved = await api.resetSettings();
            await mutate("/api/settings", saved, { revalidate: false });
            setEdits(null);
            setChoice(saved.theme);
            toast.success("Settings reset to defaults");
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />
    </div>
  );
}
