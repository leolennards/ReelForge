import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  CircleHelp,
  Info,
  MinusCircle,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import type { AreaStatus, CompatibilityReport, ConversionPlan, ReadyItem } from "@/lib/types";

import { Badge, type Tone } from "../ui/badge";

export const OVERALL_TONE: Record<CompatibilityReport["overall"], Tone> = {
  likely_compatible: "success",
  remux_recommended: "info",
  audio_conversion: "warning",
  video_conversion: "danger",
  uncertain: "warning",
};

const AREA: Record<AreaStatus, { tone: Tone; icon: ReactNode }> = {
  compatible: { tone: "success", icon: <CheckCircle2 className="size-4 text-success" /> },
  convert: { tone: "warning", icon: <RefreshCw className="size-4 text-warning" /> },
  uncertain: { tone: "warning", icon: <CircleHelp className="size-4 text-warning" /> },
  missing: { tone: "danger", icon: <CircleAlert className="size-4 text-danger" /> },
  not_applicable: { tone: "neutral", icon: <MinusCircle className="size-4 text-faint" /> },
};

const AREA_NAMES = { container: "Container", video: "Video", audio: "Audio", subtitles: "Subtitles" } as const;

export function CompatibilityPanel({ report, profileName }: { report: CompatibilityReport; profileName: string }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={OVERALL_TONE[report.overall]} className="px-3 py-1 text-[13px]">
          {report.overall_label}
        </Badge>
        <span className="text-sm text-muted">for {profileName}</span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(AREA_NAMES) as (keyof typeof AREA_NAMES)[]).map((key) => {
          const area = report.areas[key];
          const style = AREA[area.status];
          return (
            <li key={key} className="rounded-xl border border-line bg-sunken/50 p-3.5">
              <div className="flex items-center gap-2">
                {style.icon}
                <span className="text-sm font-medium">{AREA_NAMES[key]}</span>
                <Badge tone={style.tone} className="ml-auto">
                  {area.label}
                </Badge>
              </div>
              {area.reasons.length > 0 && (
                <ul className="mt-2 space-y-1 text-[13px] leading-relaxed text-muted">
                  {area.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <p className="flex gap-2 text-xs leading-relaxed text-faint">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        {report.disclaimer}
      </p>
    </div>
  );
}

function List({ items, icon, className }: { items: string[]; icon: ReactNode; className?: string }) {
  if (!items.length) return null;
  return (
    <ul className={cn("space-y-1.5", className)}>
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-[13px] leading-relaxed">
          <span className="mt-0.5 shrink-0">{icon}</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Plain-English explanation of what the conversion will change and keep. */
export function PlanSummary({ plan }: { plan: ConversionPlan }) {
  return (
    <div className="space-y-4">
      <p className="text-[15px] leading-relaxed text-fg">{plan.summary}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {plan.changes.length > 0 && (
          <div className="rounded-xl border border-line bg-sunken/50 p-4">
            <p className="mb-2.5 text-xs font-semibold tracking-wide text-faint uppercase">What changes</p>
            <List items={plan.changes} icon={<ArrowRight className="size-3.5 text-accent" />} />
          </div>
        )}
        {plan.keeps.length > 0 && (
          <div className="rounded-xl border border-line bg-sunken/50 p-4">
            <p className="mb-2.5 text-xs font-semibold tracking-wide text-faint uppercase">What stays the same</p>
            <List items={plan.keeps} icon={<CheckCircle2 className="size-3.5 text-success" />} />
          </div>
        )}
      </div>
      {plan.warnings.length > 0 && (
        <div className="rounded-xl border border-warning/25 bg-warning-soft p-4">
          <p className="mb-2.5 flex items-center gap-2 text-xs font-semibold tracking-wide text-warning uppercase">
            <TriangleAlert className="size-3.5" /> Before you convert
          </p>
          <List items={plan.warnings} icon={<span className="block size-1.5 translate-y-1.5 rounded-full bg-warning" />} className="text-fg" />
        </div>
      )}
      {plan.errors.length > 0 && (
        <div className="rounded-xl border border-danger/25 bg-danger-soft p-4" role="alert">
          <p className="mb-2.5 flex items-center gap-2 text-xs font-semibold tracking-wide text-danger uppercase">
            <ShieldAlert className="size-3.5" /> Can&apos;t convert with these settings
          </p>
          <List items={plan.errors} icon={<XCircle className="size-3.5 text-danger" />} className="text-fg" />
        </div>
      )}
    </div>
  );
}

const READY_ICON: Record<ReadyItem["status"], ReactNode> = {
  pass: <CheckCircle2 className="size-4 text-success" />,
  warn: <TriangleAlert className="size-4 text-warning" />,
  fail: <XCircle className="size-4 text-danger" />,
  info: <CircleDashed className="size-4 text-faint" />,
};

export function TvReadyCheck({ items }: { items: ReadyItem[] }) {
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {items.map((item) => (
          <li key={item.key} className="flex gap-3 bg-sunken/40 px-4 py-3">
            <span className="mt-0.5">{READY_ICON[item.status]}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-[13px] leading-relaxed text-muted">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-faint">
        This is a compatibility assessment, not a guarantee. ReelForge checked the file on this computer; it has not
        been played on your TV.
      </p>
    </div>
  );
}
