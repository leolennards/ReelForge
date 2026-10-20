"use client";

import { Cpu, HardDrive, ShieldCheck } from "lucide-react";

import { useSystem } from "@/lib/hooks";
import { cn } from "@/lib/cn";

import { Tooltip } from "../ui/overlays";

type Level = "ok" | "warn" | "down" | "pending";

function Dot({ level }: { level: Level }) {
  const color = { ok: "bg-success", warn: "bg-warning", down: "bg-danger", pending: "bg-faint" }[level];
  return (
    <span className="relative flex size-2">
      {level === "ok" && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-40", color)} />}
      <span className={cn("relative size-2 rounded-full", color)} />
    </span>
  );
}

export function useEngineStatus() {
  const { data, error, isLoading } = useSystem();
  const engine: Level = error ? "down" : isLoading && !data ? "pending" : "ok";
  const ffmpeg: Level = !data ? (error ? "down" : "pending") : data.ffmpeg.available ? "ok" : "warn";
  return { data, engine, ffmpeg };
}

/** Sidebar footer: local processing + FFmpeg availability. */
export function SidebarStatus({ collapsed }: { collapsed: boolean }) {
  const { data, engine, ffmpeg } = useEngineStatus();
  const rows = [
    {
      icon: <ShieldCheck className="size-3.5" />,
      label: "Local processing",
      value: engine === "down" ? "Engine offline" : engine === "pending" ? "Connecting…" : "On this computer",
      level: engine,
    },
    {
      icon: <Cpu className="size-3.5" />,
      label: "FFmpeg",
      value:
        ffmpeg === "ok"
          ? `Ready${data?.ffmpeg.version ? ` · ${data.ffmpeg.version.split("-")[0]}` : ""}`
          : ffmpeg === "warn"
            ? "Not installed"
            : ffmpeg === "down"
              ? "Unknown"
              : "Checking…",
      level: ffmpeg,
    },
  ];
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-3 py-2">
        {rows.map((r) => (
          <Tooltip key={r.label} content={`${r.label}: ${r.value}`} side="right">
            <span className="flex items-center gap-1.5 text-faint" tabIndex={0}>
              <Dot level={r.level} />
            </span>
          </Tooltip>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2.5 rounded-xl border border-line bg-sunken/60 p-3">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2.5">
          <span className="text-faint">{r.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-faint">{r.label}</p>
            <p className="truncate text-xs font-medium text-fg">{r.value}</p>
          </div>
          <Dot level={r.level} />
        </div>
      ))}
    </div>
  );
}

export function LocalBadge() {
  const { engine } = useEngineStatus();
  const offline = engine === "down";
  return (
    <Tooltip
      content={
        offline
          ? "The local engine isn't responding. Start it with the dev script."
          : "Movies are processed on this computer. Nothing is uploaded to the internet."
      }
    >
      <span
        tabIndex={0}
        className={cn(
          "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium sm:inline-flex",
          offline ? "border-danger/25 bg-danger-soft text-danger" : "border-success/20 bg-success-soft text-success",
        )}
      >
        <HardDrive className="size-3.5" />
        {offline ? "Engine offline" : "Local only"}
      </span>
    </Tooltip>
  );
}
