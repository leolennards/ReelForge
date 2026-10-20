"use client";

import { EyeOff, ListVideo, WifiOff } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type { Job } from "@/lib/types";

import { useJobs } from "../providers/jobs";
import { EngineBanner } from "../shell/engine-banner";
import { ButtonLink, Button } from "../ui/button";
import { Card } from "../ui/card";
import { Callout, EmptyState } from "../ui/feedback";
import { Segmented } from "../ui/form";
import { JobCard } from "./job-card";

type Filter = "all" | "active" | "completed" | "problems";

const MATCH: Record<Filter, (j: Job) => boolean> = {
  all: () => true,
  active: (j) => ["queued", "running", "validating"].includes(j.status),
  completed: (j) => j.status === "completed",
  problems: (j) => ["failed", "canceled", "interrupted"].includes(j.status),
};

export function QueueView() {
  const { jobs, connection } = useJobs();
  const [filter, setFilter] = useState<Filter>("all");
  const visible = jobs.filter((j) => !j.queue_hidden);
  // Active work first (oldest queued first, since that's the run order), then the rest by recency.
  const ordered = [
    ...visible.filter(MATCH.active).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    ...visible.filter((j) => !MATCH.active(j)),
  ].filter(MATCH[filter]);
  const counts = Object.fromEntries(
    (Object.keys(MATCH) as Filter[]).map((f) => [f, visible.filter(MATCH[f]).length]),
  ) as Record<Filter, number>;
  const finished = visible.length - counts.active;

  return (
    <div className="space-y-6">
      <EngineBanner />
      {connection === "offline" && (
        <Callout tone="warning" title="Live updates paused">
          <span className="inline-flex items-center gap-1.5">
            <WifiOff className="size-3.5" /> Reconnecting to the local engine…
          </span>
        </Callout>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          ariaLabel="Filter jobs"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All ${counts.all}` },
            { value: "active", label: `Active ${counts.active}` },
            { value: "completed", label: `Completed ${counts.completed}` },
            { value: "problems", label: `Needs attention ${counts.problems}` },
          ]}
        />
        <div className="ml-auto flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<EyeOff className="size-4" />}
            disabled={finished === 0}
            onClick={async () => {
              try {
                const r = await api.hideFinished();
                toast.success(`Cleared ${r.hidden} finished job${r.hidden === 1 ? "" : "s"} from the queue`, {
                  description: "They're still in Conversion History.",
                });
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            Clear finished
          </Button>
        </div>
      </div>

      {ordered.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={<ListVideo className="size-5" />}
            title={filter === "all" ? "The queue is empty" : "Nothing here"}
            description={
              filter === "all"
                ? "Conversions you start appear here with live progress. Movies are converted one at a time by default."
                : "No jobs match this filter."
            }
            action={
              filter === "all" ? (
                <ButtonLink href="/convert" variant="primary" size="sm">
                  Convert a movie
                </ButtonLink>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {ordered.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
