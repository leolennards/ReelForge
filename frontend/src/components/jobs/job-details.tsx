"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import { api } from "@/lib/api";
import { formatBytes, formatDuration } from "@/lib/format";
import type { Job } from "@/lib/types";

import { TvReadyCheck } from "../media/compatibility";
import { Dialog } from "../ui/overlays";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-2 text-sm">
      <dt className="text-faint">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function VerificationList({ job }: { job: Job }) {
  if (!job.validation) return null;
  return (
    <ul className="space-y-1.5">
      {job.validation.checks.map((c) => (
        <li key={c.name} className="flex gap-2.5 text-[13px]">
          {c.ok ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />
          )}
          <span>
            <span className="font-medium">{c.name}:</span> <span className="text-muted">{c.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function JobDetailsDialog({
  job,
  open,
  onOpenChange,
}: {
  job: Job;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={job.source_name} description={job.strategy_label} size="lg">
      <div className="space-y-6">
        <dl className="divide-y divide-line">
          <Row label="Status">{job.status}</Row>
          <Row label="Device profile">{job.profile_name}</Row>
          <Row label="Output file">
            {job.output_name}.{job.plan.container}
          </Row>
          {job.output_path && <Row label="Location">{job.output_path}</Row>}
          <Row label="Sizes">
            {formatBytes(job.source_size)} → {formatBytes(job.output_size)}
          </Row>
          <Row label="Duration">{formatDuration(job.duration_seconds)}</Row>
          <Row label="Created">{new Date(job.created_at).toLocaleString()}</Row>
          {job.finished_at && <Row label="Finished">{new Date(job.finished_at).toLocaleString()}</Row>}
          {job.error && <Row label="Error">{job.error}</Row>}
        </dl>

        <section>
          <h3 className="mb-2 text-sm font-semibold">What ReelForge did</h3>
          <p className="text-[13px] leading-relaxed text-muted">{job.plan.summary}</p>
          {job.plan.changes.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-muted">
              {job.plan.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
        </section>

        {job.validation && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Verification</h3>
            <VerificationList job={job} />
          </section>
        )}

        {job.ready && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">TV Ready Check</h3>
            <TvReadyCheck items={job.ready} />
          </section>
        )}

        {job.srt_available && (
          <a className="text-sm text-accent underline-offset-4 hover:underline" href={api.subtitlesUrl(job.id)} download>
            Download the separate .srt subtitle file
          </a>
        )}
      </div>
    </Dialog>
  );
}
