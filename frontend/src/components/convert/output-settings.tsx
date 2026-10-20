"use client";

import { ChevronDown, FolderOpen, SlidersHorizontal, Terminal } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { cn } from "@/lib/cn";
import { channelsLabel, formatBytes, languageName } from "@/lib/format";
import type { ConversionOptions, MediaInfo, PlanResponse } from "@/lib/types";

import { FolderPicker } from "../media/folder-picker";
import { Button } from "../ui/button";
import { Field, Input, Segmented, Select, Switch } from "../ui/form";

type Update = (patch: Partial<ConversionOptions>) => void;

export function OutputSettings({
  info,
  options,
  update,
  plan,
  outputName,
  setOutputName,
  outputDir,
  setOutputDir,
  hardwareAvailable,
  nameError,
}: {
  info: MediaInfo;
  options: ConversionOptions;
  update: Update;
  plan: PlanResponse | undefined;
  outputName: string;
  setOutputName: (v: string) => void;
  outputDir: string;
  setOutputDir: (v: string) => void;
  hardwareAvailable: boolean;
  nameError?: string;
}) {
  const [advanced, setAdvanced] = useState(options.mode === "custom");
  const [picker, setPicker] = useState(false);
  const p = plan?.plan;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Output file name"
          htmlFor="output-name"
          error={nameError}
          hint={p ? `Saved as “${outputName || "…"}${p.extension}”. Existing files are never overwritten.` : undefined}
        >
          <Input
            id="output-name"
            value={outputName}
            maxLength={150}
            aria-invalid={nameError ? true : undefined}
            onChange={(e) => setOutputName(e.target.value)}
          />
        </Field>
        <Field label="Output folder" hint="Where the converted copy is saved." htmlFor="output-dir">
          <div className="flex gap-2">
            <Input id="output-dir" value={outputDir} readOnly className="font-mono text-xs" />
            <Button variant="secondary" icon={<FolderOpen className="size-4" />} onClick={() => setPicker(true)}>
              Change
            </Button>
          </div>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Format" hint="Picked automatically from the device profile.">
          <p className="flex h-10 items-center rounded-xl border border-line bg-sunken/60 px-3 text-sm">
            {p ? (p.container === "mp4" ? "MP4" : "MKV (Matroska)") : "—"}
          </p>
        </Field>
        <Field
          label="Video quality"
          hint={p?.video_encode ? "Used because the video is re-encoded." : "Only applies when the video is re-encoded."}
        >
          <Segmented
            ariaLabel="Video quality"
            value={options.quality}
            onChange={(quality) => update({ quality })}
            options={[
              { value: "high", label: "High", description: "Best picture, larger file" },
              { value: "balanced", label: "Balanced", description: "Recommended" },
              { value: "compact", label: "Compact", description: "Smaller file" },
            ]}
          />
        </Field>
        <Field label="Estimated size" hint={p?.estimate_note}>
          <p className="flex h-10 items-center rounded-xl border border-line bg-sunken/60 px-3 text-sm">
            {p?.estimated_size ? `≈ ${formatBytes(p.estimated_size)}` : "Can't be reliably predicted"}
          </p>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Audio format" hint="Only used for audio tracks that need converting.">
          <Select
            ariaLabel="Audio format"
            value={options.audio_codec}
            onChange={(audio_codec) => update({ audio_codec })}
            options={[
              { value: "auto", label: "Automatic (profile's choice)" },
              { value: "aac", label: "AAC", description: "Most widely supported" },
              { value: "ac3", label: "Dolby Digital (AC-3)", description: "Good for soundbars, up to 5.1" },
              { value: "eac3", label: "Dolby Digital Plus (E-AC-3)" },
              { value: "mp3", label: "MP3 (stereo)" },
              { value: "copy", label: "Keep original audio", description: "Advanced: no audio conversion" },
            ]}
          />
        </Field>
        <Field label="Audio bitrate" hint="Automatic picks 192 kb/s for stereo and more for surround.">
          <Select
            ariaLabel="Audio bitrate"
            value={options.audio_bitrate_kbps ? String(options.audio_bitrate_kbps) : "auto"}
            onChange={(v) => update({ audio_bitrate_kbps: v === "auto" ? null : Number(v) })}
            options={[
              { value: "auto", label: "Automatic" },
              ...[128, 192, 256, 320, 384, 448, 640].map((k) => ({ value: String(k), label: `${k} kb/s` })),
            ]}
          />
        </Field>
      </div>

      <div className="rounded-xl border border-line">
        <button
          type="button"
          onClick={() => setAdvanced((a) => !a)}
          aria-expanded={advanced}
          className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium hover:bg-surface-hover"
        >
          <SlidersHorizontal className="size-4 text-accent" />
          Advanced settings
          <span className="text-xs font-normal text-faint">tracks, subtitles, resolution, codecs</span>
          <ChevronDown className={cn("ml-auto size-4 text-faint transition-transform", advanced && "rotate-180")} />
        </button>
        <AnimatePresence initial={false}>
          {advanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <AdvancedPanel info={info} options={options} update={update} hardwareAvailable={hardwareAvailable} plan={plan} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <FolderPicker open={picker} onOpenChange={setPicker} initialPath={outputDir} onPick={setOutputDir} />
    </div>
  );
}

function AdvancedPanel({
  info,
  options,
  update,
  hardwareAvailable,
  plan,
}: {
  info: MediaInfo;
  options: ConversionOptions;
  update: Update;
  hardwareAvailable: boolean;
  plan: PlanResponse | undefined;
}) {
  const custom = options.mode === "custom";
  const customHint = custom ? undefined : "Switch the strategy to Custom to change this.";
  return (
    <div className="space-y-5 border-t border-line p-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Container" hint={customHint}>
          <Select
            ariaLabel="Container"
            disabled={!custom && options.mode !== "remux"}
            value={options.container}
            onChange={(container) => update({ container })}
            options={[
              { value: "auto", label: "Automatic" },
              { value: "mp4", label: "MP4" },
              { value: "mkv", label: "MKV" },
            ]}
          />
        </Field>
        <Field label="Video" hint={customHint}>
          <Select
            ariaLabel="Video codec"
            disabled={!custom}
            value={options.video_codec}
            onChange={(video_codec) => update({ video_codec })}
            options={[
              { value: "auto", label: "Automatic" },
              { value: "copy", label: "Keep original (no re-encode)" },
              { value: "h264", label: "Re-encode to H.264" },
              { value: "hevc", label: "Re-encode to H.265 (HEVC)" },
            ]}
          />
        </Field>
        <Field label="Encoder speed" hint="Slower gives slightly smaller files at the same quality.">
          <Select
            ariaLabel="Encoder speed"
            value={options.encoder_preset}
            onChange={(encoder_preset) => update({ encoder_preset })}
            options={[
              { value: "veryfast", label: "Very fast" },
              { value: "fast", label: "Fast" },
              { value: "medium", label: "Medium (default)" },
              { value: "slow", label: "Slow" },
            ]}
          />
        </Field>
        <Field label="Maximum resolution" hint={customHint}>
          <Select
            ariaLabel="Maximum resolution"
            disabled={!custom}
            value={String(options.max_height)}
            onChange={(v) => update({ max_height: Number(v) as ConversionOptions["max_height"] })}
            options={[
              { value: "0", label: "Keep (within profile limit)" },
              { value: "2160", label: "4K (2160p)" },
              { value: "1440", label: "1440p" },
              { value: "1080", label: "1080p" },
              { value: "720", label: "720p" },
              { value: "480", label: "480p" },
            ]}
          />
        </Field>
        <Field label="Frame rate" hint={customHint}>
          <Select
            ariaLabel="Frame rate"
            disabled={!custom}
            value={options.frame_rate}
            onChange={(frame_rate) => update({ frame_rate })}
            options={[
              { value: "keep", label: "Keep original" },
              ...(["24", "25", "30", "50", "60"] as const).map((f) => ({ value: f, label: `${f} fps` })),
            ]}
          />
        </Field>
        <Field label="Quality value (CRF)" hint={custom ? "12 = near lossless, 35 = smallest. Software encoders only." : customHint}>
          <Input
            type="number"
            min={12}
            max={35}
            disabled={!custom}
            placeholder="Automatic"
            value={options.crf ?? ""}
            onChange={(e) => {
              const n = e.target.value ? Number(e.target.value) : null;
              update({ crf: n != null && n >= 12 && n <= 35 ? n : null });
            }}
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Audio channels" hint="Surround is only reduced when you choose it or the profile requires it.">
          <Select
            ariaLabel="Audio channels"
            value={options.audio_channels}
            onChange={(audio_channels) => update({ audio_channels })}
            options={[
              { value: "auto", label: "Automatic (keep where possible)" },
              { value: "5.1", label: "Up to 5.1" },
              { value: "stereo", label: "Stereo" },
            ]}
          />
        </Field>
        <Field label="Audio tracks">
          <Select
            ariaLabel="Audio tracks"
            value={options.audio_tracks === "selected" ? `track-${options.audio_stream}` : options.audio_tracks}
            onChange={(v) =>
              v.startsWith("track-")
                ? update({ audio_tracks: "selected", audio_stream: Number(v.slice(6)) })
                : update({ audio_tracks: v as "all" | "primary", audio_stream: null })
            }
            options={[
              { value: "all", label: "All audio tracks" },
              { value: "primary", label: "Main track only" },
              ...info.audio.map((a) => ({
                value: `track-${a.index}`,
                label: `${languageName(a.language)} · ${a.codec_label} ${channelsLabel(a.channels)}`,
              })),
            ]}
          />
        </Field>
        <Field label="Subtitles">
          <Select
            ariaLabel="Subtitles"
            disabled={info.subtitles.length === 0}
            value={options.subtitles === "selected" ? `sub-${options.subtitle_stream}` : options.subtitles}
            onChange={(v) =>
              v.startsWith("sub-")
                ? update({ subtitles: "selected", subtitle_stream: Number(v.slice(4)) })
                : update({ subtitles: v as ConversionOptions["subtitles"], subtitle_stream: null })
            }
            options={[
              { value: "auto", label: "Profile default" },
              { value: "keep_compatible", label: "Keep all that fit" },
              { value: "first_only", label: "Main subtitle only" },
              { value: "none", label: "No subtitles" },
              ...info.subtitles.map((s) => ({
                value: `sub-${s.index}`,
                label: `${languageName(s.language)} · ${s.codec_label}`,
              })),
            ]}
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Switch
          checked={options.external_srt}
          onChange={(external_srt) => update({ external_srt })}
          disabled={!info.subtitles.some((s) => s.kind === "text")}
          label="Also save subtitles as a separate .srt file"
          description="Many TVs show an .srt file with the same name as the movie more reliably than embedded subtitles."
        />
        <Switch
          checked={options.hardware_acceleration}
          onChange={(hardware_acceleration) => update({ hardware_acceleration })}
          disabled={!hardwareAvailable}
          label="Hardware-accelerated encoding"
          description={
            hardwareAvailable
              ? "Much faster video re-encoding using your graphics hardware; files may be slightly larger."
              : "No working hardware encoder was detected on this computer."
          }
        />
        <Switch
          checked={options.keep_metadata}
          onChange={(keep_metadata) => update({ keep_metadata })}
          label="Keep title and language information"
        />
        <Switch
          checked={options.keep_chapters}
          onChange={(keep_chapters) => update({ keep_chapters })}
          disabled={info.chapters === 0}
          label="Keep chapter markers"
          description={info.chapters === 0 ? "This movie has no chapters." : `${info.chapters} chapters found.`}
        />
      </div>

      {plan?.command_preview && (
        <details className="group rounded-xl border border-line bg-sunken/60">
          <summary className="flex cursor-pointer items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-muted">
            <Terminal className="size-3.5" /> FFmpeg command that will run (read-only)
          </summary>
          <pre className="overflow-x-auto border-t border-line p-3.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted">
            {plan.command_preview.join(" ")}
          </pre>
        </details>
      )}
    </div>
  );
}
