"use client";

import { Clapperboard, PartyPopper, ShieldCheck, Usb } from "lucide-react";
import { motion } from "motion/react";

import { formatBytes, formatDuration } from "@/lib/format";
import type { Job } from "@/lib/types";

import { JobCard, JobOutputActions } from "../jobs/job-card";
import { VerificationList } from "../jobs/job-details";
import { TvReadyCheck } from "../media/compatibility";
import { UsbGuide } from "../media/usb-guide";
import { Button } from "../ui/button";
import { Step } from "./step";

/** Steps 7 and 8: live progress, then verification and the finished file. */
export function ResultPanel({ job, onConvertAnother }: { job: Job; onConvertAnother: () => void }) {
  const done = job.status === "completed";
  const verifying = job.status === "validating";
  return (
    <div className="space-y-5">
      <JobCard job={job} />

      <Step
        number={7}
        title="Verify"
        done={done}
        disabled={!done && !verifying && job.status !== "failed"}
        description="FFprobe inspects the converted file to confirm it can be read and contains the expected streams."
      >
        {job.validation ? (
          <VerificationList job={job} />
        ) : (
          <p className="text-sm text-muted">
            {verifying ? "Checking the converted file…" : "Runs automatically when the conversion finishes."}
          </p>
        )}
      </Step>

      {done && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Step number={8} title="Finished" done description="Your converted movie is ready to copy to a USB drive.">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-success/25 bg-success-soft p-4">
                <PartyPopper className="size-6 text-success" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {job.output_name}.{job.plan.container}
                  </p>
                  <p className="truncate text-xs text-muted" title={job.output_path ?? undefined}>
                    {job.output_dir} · {formatBytes(job.output_size)} · converted in {formatDuration(job.duration_seconds)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <JobOutputActions job={job} />
                  <Button size="sm" variant="primary" icon={<Clapperboard className="size-4" />} onClick={onConvertAnother}>
                    Convert another
                  </Button>
                </div>
              </div>

              {job.plan.changes.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-semibold">Changes made</p>
                  <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted">
                    {job.plan.changes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {job.ready && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="size-4 text-accent" /> TV Ready Check · {job.profile_name}
                  </p>
                  <TvReadyCheck items={job.ready} />
                </div>
              )}

              <details className="rounded-xl border border-line">
                <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
                  <Usb className="size-4 text-accent" /> USB drive guide and playback checklist
                </summary>
                <div className="border-t border-line p-4">
                  <UsbGuide />
                </div>
              </details>
            </div>
          </Step>
        </motion.div>
      )}
    </div>
  );
}
