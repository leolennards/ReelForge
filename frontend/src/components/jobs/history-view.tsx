"use client";

import { ArrowRight, FolderOpen, History, Info, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";

import { api } from "@/lib/api";
import { formatBytes, formatDuration } from "@/lib/format";
import { useHistory, useSystem } from "@/lib/hooks";
import type { Job } from "@/lib/types";

import { Badge } from "../ui/badge";
import { Button, ButtonLink } from "../ui/button";
import { Card } from "../ui/card";
import { Callout, EmptyState, Skeleton } from "../ui/feedback";
import { ConfirmDialog, Tooltip } from "../ui/overlays";
import { STATUS, useJobActions } from "./job-card";
import { JobDetailsDialog } from "./job-details";

function HistoryRow({ job, onDelete }: { job: Job; onDelete: (job: Job) => void }) {
  const [details, setDetails] = useState(false);
  const actions = useJobActions(job);
  const s = STATUS[job.status];
  return (
    <li className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={s.tone} icon={s.icon}>
            {s.label}
          </Badge>
          <Badge>{job.strategy_label}</Badge>
        </div>
        <p className="mt-1.5 flex min-w-0 items-center gap-2 text-sm">
          <span className="truncate font-medium" title={job.source_name}>
            {job.source_name}
          </span>
          {job.status === "completed" && (
            <>
              <ArrowRight className="size-3.5 shrink-0 text-faint" />
              <span className="truncate text-muted">
                {job.output_name}.{job.plan.container}
              </span>
            </>
          )}
        </p>
        {job.error && <p className="mt-1 line-clamp-2 text-xs text-danger">{job.error}</p>}
      </div>
      <dl className="grid grid-cols-[1.4fr_0.8fr_1fr] gap-3 text-xs">
        <div>
          <dt className="text-faint">Size</dt>
          <dd className="mt-0.5 tabular-nums">
            {formatBytes(job.source_size)}
            {job.output_size ? ` → ${formatBytes(job.output_size)}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-faint">Took</dt>
          <dd className="mt-0.5 tabular-nums">{formatDuration(job.duration_seconds)}</dd>
        </div>
        <div>
          <dt className="text-faint">Date</dt>
          <dd className="mt-0.5">{job.finished_at ? new Date(job.finished_at).toLocaleDateString() : "—"}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
        {["failed", "canceled", "interrupted"].includes(job.status) && (
          <Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" />} loading={actions.busy === "retry"} onClick={actions.retry}>
            Retry
          </Button>
        )}
        {job.status === "completed" && job.output_available && (
          <Tooltip content="Show in folder">
            <Button size="icon" variant="ghost" aria-label="Show in folder" onClick={actions.reveal}>
              <FolderOpen className="size-4" />
            </Button>
          </Tooltip>
        )}
        <Tooltip content="Details">
          <Button size="icon" variant="ghost" aria-label={`Details for ${job.source_name}`} onClick={() => setDetails(true)}>
            <Info className="size-4" />
          </Button>
        </Tooltip>
        <Tooltip content="Delete record">
          <Button size="icon" variant="ghost" aria-label={`Delete record for ${job.source_name}`} onClick={() => onDelete(job)}>
            <Trash2 className="size-4" />
          </Button>
        </Tooltip>
      </div>
      <JobDetailsDialog job={job} open={details} onOpenChange={setDetails} />
    </li>
  );
}

export function HistoryView() {
  const history = useHistory();
  const system = useSystem();
  const [deleting, setDeleting] = useState<Job | null>(null);
  const [clearing, setClearing] = useState(false);
  const jobs = history.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted">
          {jobs.length} record{jobs.length === 1 ? "" : "s"} stored on this computer
        </p>
        <Button
          className="ml-auto"
          variant="danger"
          size="sm"
          icon={<Trash2 className="size-4" />}
          disabled={!jobs.length}
          onClick={() => setClearing(true)}
        >
          Clear all history
        </Button>
      </div>

      <Card>
        {history.isLoading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : history.error ? (
          <div className="p-5">
            <Callout tone="danger" title="History couldn't be loaded">
              {(history.error as Error).message}
            </Callout>
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={<History className="size-5" />}
            title="No conversions yet"
            description="Finished, failed and canceled conversions are recorded here so you can find files and retry problems."
            action={
              <ButtonLink href="/convert" variant="primary" size="sm">
                Convert a movie
              </ButtonLink>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {jobs.map((job) => (
              <HistoryRow key={job.id} job={job} onDelete={setDeleting} />
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-accent" /> What ReelForge stores
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-muted">
          {(system.data?.stored_data ?? []).map((item) => (
            <li key={item}>{item}</li>
          ))}
          <li>Movie contents are never stored in the database.</li>
        </ul>
        <p className="mt-2 text-xs text-faint">
          Retention periods can be changed in Settings. Deleting a record doesn&apos;t delete the converted movie file.
        </p>
      </Card>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this record?"
        description="Only the history entry is removed. The converted movie file, if any, stays where it is."
        confirmLabel="Delete record"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api.deleteHistory(deleting.id);
            await mutate("/api/history");
            mutate("/api/stats");
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />
      <ConfirmDialog
        open={clearing}
        onOpenChange={setClearing}
        title="Clear all conversion history?"
        description="Every finished, failed and canceled record is deleted. Converted movie files are not deleted. This can't be undone."
        confirmLabel="Clear history"
        onConfirm={async () => {
          try {
            const r = await api.clearHistory();
            await mutate("/api/history");
            mutate("/api/stats");
            toast.success(`Deleted ${r.deleted} record${r.deleted === 1 ? "" : "s"}`);
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />
    </div>
  );
}
