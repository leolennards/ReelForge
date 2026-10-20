import { AudioLines, Captions, Clapperboard, FileVideo } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import {
  channelsLabel,
  formatBitrate,
  formatBytes,
  formatRuntime,
  languageName,
  resolutionLabel,
} from "@/lib/format";
import type { MediaInfo } from "@/lib/types";

import { Badge } from "../ui/badge";

function Stat({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-wide text-faint uppercase">{label}</dt>
      <dd className={cn("mt-1 truncate text-sm text-fg", mono && "font-mono text-[13px]")}>{value}</dd>
    </div>
  );
}

function Section({ icon, title, count, children }: { icon: ReactNode; title: string; count: number; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-sunken/50">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="text-accent">{icon}</span>
        <h4 className="text-[13px] font-semibold">{title}</h4>
        <Badge className="ml-auto">{count}</Badge>
      </header>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

/** Read-only view of what FFprobe found inside a movie. */
export function MediaInspector({ info }: { info: MediaInfo }) {
  const video = info.video.find((v) => v.index === info.primary_video);
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Container" value={info.container_label} />
        <Stat label="File size" value={formatBytes(info.size)} />
        <Stat label="Duration" value={formatRuntime(info.duration)} />
        <Stat label="Resolution" value={video ? resolutionLabel(video.width, video.height) : "No video"} />
        <Stat label="Frame rate" value={video?.fps ? `${video.fps.toFixed(3).replace(/\.?0+$/, "")} fps` : "—"} />
        <Stat label="Overall bitrate" value={formatBitrate(info.bitrate)} />
      </dl>

      <div className="grid gap-3 xl:grid-cols-2">
        <Section icon={<Clapperboard className="size-4" />} title="Video" count={info.video.length}>
          {info.video.length === 0 && <p className="px-4 py-3 text-sm text-muted">No video stream.</p>}
          {info.video.map((v) => (
            <div key={v.index} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-sm">
              <span className="font-medium">{v.codec_label}</span>
              {v.profile && <span className="text-muted">{v.profile}</span>}
              <span className="text-muted">{v.bit_depth}-bit</span>
              <span className="text-muted">{formatBitrate(v.bitrate)}</span>
              {v.hdr && <Badge tone="info">{v.hdr}</Badge>}
              {v.dolby_vision && <Badge tone="info">Dolby Vision</Badge>}
              {v.index === info.primary_video && <Badge tone="accent">Main</Badge>}
            </div>
          ))}
        </Section>

        <Section icon={<AudioLines className="size-4" />} title="Audio" count={info.audio.length}>
          {info.audio.length === 0 && (
            <p className="px-4 py-3 text-sm text-warning">No audio track: the movie will play silently.</p>
          )}
          {info.audio.map((a) => (
            <div key={a.index} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-sm">
              <span className="font-medium">{a.codec_label}</span>
              <span className="text-muted">{channelsLabel(a.channels, a.channel_layout)}</span>
              <span className="text-muted">{a.sample_rate ? `${(a.sample_rate / 1000).toFixed(1)} kHz` : ""}</span>
              <span className="text-muted">{formatBitrate(a.bitrate)}</span>
              <span className="text-muted">{languageName(a.language)}</span>
              {a.title && <span className="truncate text-faint">“{a.title}”</span>}
              {a.index === info.primary_audio && <Badge tone="accent">Main</Badge>}
            </div>
          ))}
        </Section>
      </div>

      <Section icon={<Captions className="size-4" />} title="Subtitles" count={info.subtitles.length}>
        {info.subtitles.length === 0 && <p className="px-4 py-3 text-sm text-muted">No embedded subtitles.</p>}
        {info.subtitles.map((s) => (
          <div key={s.index} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-sm">
            <span className="font-medium">{s.codec_label}</span>
            <span className="text-muted">{languageName(s.language)}</span>
            <Badge tone={s.kind === "bitmap" ? "warning" : "neutral"}>{s.kind === "bitmap" ? "Image-based" : "Text"}</Badge>
            {s.forced && <Badge>Forced</Badge>}
            {s.default && <Badge>Default</Badge>}
            {s.title && <span className="truncate text-faint">“{s.title}”</span>}
          </div>
        ))}
      </Section>

      {(info.chapters > 0 || info.attachments > 0 || info.data_streams > 0) && (
        <p className="flex items-center gap-2 text-xs text-faint">
          <FileVideo className="size-3.5" />
          {[
            info.chapters ? `${info.chapters} chapters` : null,
            info.attachments ? `${info.attachments} attachments` : null,
            info.data_streams ? `${info.data_streams} data streams` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}
