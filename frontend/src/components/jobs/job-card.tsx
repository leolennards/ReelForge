"use client";

import {
  Ban,
  CheckCircle2,
  Clock,
  Download,
  EyeOff,
  FolderOpen,
  Gauge,
  Info,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Timer,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { DEMO, DEMO_MESSAGE } from "@/lib/demo";
import { elapsedSince, formatBytes, formatDuration, relativeTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { Job, JobStatus } from "@/lib/types";

import { Badge, type Tone } from "../ui/badge";
import { Button } from "../ui/button";
import { Progress } from "../ui/feedback";
import { ConfirmDialog, Tooltip } from "../ui/overlays";
import { JobDetailsDialog } from "./job-details";

export const STATUS: Record<JobStatus, { label: string; tone: Tone; icon: ReactNode }> = {
  queued: { label: "Queued", tone: "neutral", icon: <Clock className="size-3.5" /> },
  running: { label: "Converting", tone: "accent", icon: <Loader2 className="size-3.5 animate-spin" /> },
  validating: { label: "Verifying", tone: "info", icon: <ShieldCheck className="size-3.5" /> },
  completed: { label: "Completed", tone: "success", icon: <CheckCircle2 className="size-3.5" /> },
  failed: { label: "Failed", tone: "danger", icon: <XCircle className="size-3.5" /> },
  canceled: { label: "Canceled", tone: "neutral", icon: <Ban className="size-3.5" /> },
  interrupted: { label: "Interrupted", tone: "warning", icon: <TriangleAlert className="size-3.5" /> },
};

export function useJobActions(job: Job) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (name: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(name);
    try {
      await fn();
      if (success) toast.success(success);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return {
    busy,
    cancel: () => run("cancel", () => api.cancelJob(job.id), "Conversion canceled"),
    retry: () => run("retry", () => api.retryJob(job.id), "Added back to the queue"),
    hide: () => run("hide", () => api.hideJob(job.id)),
    reveal: () => run("reveal", () => api.revealJob(job.id)),
  };
}

export function JobOutputActions({ job, compact }: { job: Job; compact?: boolean }) {
  const actions = useJobActions(job);
  if (job.status !== "completed" || !job.output_available) return null;
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        icon={<FolderOpen className="size-4" />}
        loading={actions.busy === "reveal"}
        onClick={actions.reveal}
      >
        {compact ? "Show" : "Show in folder"}
      </Button>
      {DEMO ? (
        <Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={() => toast(DEMO_MESSAGE)}>
          Download
        </Button>
      ) : (
        <a
          href={api.downloadUrl(job.id)}
          download
          className="inline-flex h-8 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[13px] font-medium hover:border-line-strong hover:bg-surface-hover"
        >
          <Download className="size-4" />
          Download
        </a>
      )}
    </>
  );
}

export function JobCard({ job }: { job: Job }) {
  const active = job.status === "running" || job.status === "validating";
  const now = useNow(active);
  const actions = useJobActions(job);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [details, setDetails] = useState(false);
  const status = STATUS[job.status];
  const elapsed = active ? elapsedSince(job.started_at, now) : job.duration_seconds;
  const canRetry = ["failed", "canceled", "interrupted"].includes(job.status);
  const finished = !["queued", "running", "validating"].includes(job.status);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className={cn(
        "rounded-[var(--radius-card)] border bg-surface p-4 shadow-card sm:p-5",
        job.status === "running" ? "border-accent/30" : "border-line",
      )}
      aria-label={`${job.source_name}: ${status.label}`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status.tone} icon={status.icon}>
              {status.label}
            </Badge>
            <Badge>{job.strategy_label}</Badge>
            <span className="text-xs text-faint">{job.profile_name}</span>
          </div>
          <h3 className="mt-2 truncate text-[15px] font-semibold tracking-tight" title={job.source_name}>
            {job.source_name}
          </h3>
          <p className="truncate text-xs text-faint">
            → {job.output_name}.{job.plan.container} · {formatBytes(job.source_size)} source · added{" "}
            {relativeTime(job.created_at, now)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <JobOutputActions job={job} compact />
          {(job.status === "queued" || active) && (
            <Button
              size="sm"
              variant="danger"
              icon={<Ban className="size-4" />}
              loading={actions.busy === "cancel"}
              onClick={() => setConfirmCancel(true)}
            >
              Cancel
            </Button>
          )}
          {canRetry && (
            <Button
              size="sm"
              variant="secondary"
              icon={<RotateCcw className="size-4" />}
              loading={actions.busy === "retry"}
              onClick={actions.retry}
            >
              Retry
            </Button>
          )}
          <Tooltip content="Details">
            <Button size="icon" variant="ghost" aria-label="Show details" onClick={() => setDetails(true)}>
              <Info className="size-4" />
            </Button>
          </Tooltip>
          {finished && (
            <Tooltip content="Remove from queue (stays in history)">
              <Button size="icon" variant="ghost" aria-label="Remove from queue" onClick={actions.hide}>
                <EyeOff className="size-4" />
              </Button>
            </Tooltip>
          )}
        </div>
      </div>

      {(active || job.status === "queued") && (
        <div className="mt-4 space-y-2">
          <Progress
            value={job.status === "queued" ? 0 : job.status === "validating" ? null : job.progress}
            label={`Progress for ${job.source_name}`}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="font-medium text-fg tabular-nums">
              {job.status === "queued"
                ? "Waiting for a free slot"
                : job.status === "validating"
                  ? "Verifying output…"
                  : job.progress != null
                    ? `${job.progress.toFixed(1)}%`
                    : "Progress unavailable (unknown duration)"}
            </span>
            {active && (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Timer className="size-3.5" /> Elapsed {formatDuration(elapsed)}
              </span>
            )}
            {job.status === "running" && (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Clock className="size-3.5" />
                {job.eta_seconds != null ? `About ${formatDuration(job.eta_seconds)} left` : "Estimating time left…"}
              </span>
            )}
            {job.status === "running" && job.speed != null && (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Gauge className="size-3.5" /> {job.speed.toFixed(1)}× speed
              </span>
            )}
          </div>
        </div>
      )}

      {job.status === "completed" && (
        <p className="mt-3 text-xs text-muted">
          {formatBytes(job.output_size)} · took {formatDuration(job.duration_seconds)} · verified
          {job.output_available ? "" : " · file has since been moved or forgotten"}
        </p>
      )}
      {job.error && job.status !== "canceled" && (
        <p className="mt-3 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-[13px] leading-relaxed text-fg">
          {job.error}
        </p>
      )}

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this conversion?"
        description="FFmpeg will be stopped and the partial file deleted. Your original movie is not affected. You can retry later, but it starts again from the beginning."
        confirmLabel="Cancel conversion"
        onConfirm={actions.cancel}
      />
      <JobDetailsDialog job={job} open={details} onOpenChange={setDetails} />
    </motion.article>
  );
}
