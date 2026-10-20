"use client";

import { Check, Tv } from "lucide-react";

import { cn } from "@/lib/cn";
import type { DeviceProfile, Mode } from "@/lib/types";

import { Badge } from "../ui/badge";

export function ProfilePicker({
  profiles,
  value,
  onChange,
}: {
  profiles: DeviceProfile[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Device profile" className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      {profiles.map((p) => {
        const active = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(p.id)}
            className={cn(
              "relative flex flex-col rounded-xl border p-3.5 text-left transition-colors",
              active ? "border-accent/50 bg-accent-soft" : "border-line bg-sunken/50 hover:border-line-strong",
            )}
          >
            <span className="flex items-center gap-2">
              <Tv className={cn("size-4", active ? "text-accent" : "text-faint")} />
              <span className="text-sm font-medium">{p.name}</span>
              {active && <Check className="ml-auto size-4 text-accent" />}
            </span>
            <span className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">{p.description || "Custom profile"}</span>
            <span className="mt-2 flex flex-wrap gap-1">
              {!p.builtin && <Badge tone="accent">Custom</Badge>}
              <Badge>{p.max_height >= 2160 ? "4K" : `${p.max_height}p`}</Badge>
              <Badge>{p.preferred_audio_codec.toUpperCase()}</Badge>
            </span>
          </button>
        );
      })}
    </div>
  );
}

const MODES: { value: Mode; label: string; description: string }[] = [
  { value: "recommended", label: "Recommended", description: "The smallest change that should make it play." },
  { value: "audio_only", label: "Fix audio only", description: "Keep the video untouched; convert incompatible audio." },
  { value: "remux", label: "Remux", description: "Repackage into a new container without re-encoding." },
  { value: "full", label: "Full conversion", description: "Re-encode the video to H.264 for the widest support." },
  { value: "custom", label: "Custom", description: "Choose every setting yourself." },
];

export function ModePicker({ value, onChange }: { value: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div role="radiogroup" aria-label="Conversion strategy" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {MODES.map((m) => {
        const active = m.value === value;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m.value)}
            className={cn(
              "rounded-xl border p-3 text-left transition-colors",
              active ? "border-accent/50 bg-accent-soft" : "border-line bg-sunken/50 hover:border-line-strong",
            )}
          >
            <span className="text-[13px] font-semibold">{m.label}</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted">{m.description}</span>
          </button>
        );
      })}
    </div>
  );
}
