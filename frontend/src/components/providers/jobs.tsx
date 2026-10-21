"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { mutate } from "swr";

import { API_URL } from "@/lib/api";
import { DEMO, demoJobs } from "@/lib/demo";
import { omit } from "@/lib/storage";
import type { Job } from "@/lib/types";

type Connection = "connecting" | "live" | "offline";

interface JobsContextValue {
  jobs: Job[];
  byId: Record<string, Job>;
  connection: Connection;
}

const JobsContext = createContext<JobsContextValue | null>(null);

const ACTIVE = new Set(["queued", "running", "validating"]);

/**
 * Keeps an always-current list of jobs using the API's Server-Sent Events
 * stream, reconnecting with backoff if the local engine restarts.
 */
export function JobsProvider({ children }: { children: ReactNode }) {
  const [byId, setById] = useState<Record<string, Job>>({});
  const [connection, setConnection] = useState<Connection>("connecting");
  const previous = useRef<Record<string, Job>>({});

  useEffect(() => {
    if (DEMO) {
      // The demo has no engine to stream from; show the recorded jobs.
      let cancelled = false;
      demoJobs().then((jobs) => {
        if (cancelled) return;
        setById(Object.fromEntries(jobs.map((j) => [j.id, j])));
        setConnection("live");
      });
      return () => {
        cancelled = true;
      };
    }
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let closed = false;

    const announce = (job: Job) => {
      const before = previous.current[job.id];
      if (!before || before.status === job.status) return;
      if (job.status === "completed") toast.success(`${job.source_name} is ready`, { description: "Conversion finished and verified." });
      if (job.status === "failed") toast.error(`${job.source_name} failed`, { description: job.error ?? undefined });
      if (!ACTIVE.has(job.status)) {
        mutate("/api/stats");
        mutate("/api/history");
        mutate("/api/media");
      }
    };

    const connect = () => {
      setConnection((c) => (c === "live" ? c : "connecting"));
      source = new EventSource(`${API_URL}/api/events`);
      source.addEventListener("snapshot", (e) => {
        attempt = 0;
        setConnection("live");
        const data = JSON.parse((e as MessageEvent).data) as { jobs: Job[] };
        const next = Object.fromEntries(data.jobs.map((j) => [j.id, j]));
        previous.current = next;
        setById(next);
      });
      source.addEventListener("job", (e) => {
        const { job } = JSON.parse((e as MessageEvent).data) as { job: Job };
        announce(job);
        previous.current = { ...previous.current, [job.id]: job };
        setById((m) => ({ ...m, [job.id]: job }));
      });
      source.addEventListener("job_removed", (e) => {
        const { id } = JSON.parse((e as MessageEvent).data) as { id: string };
        previous.current = omit(previous.current, id);
        setById((m) => omit(m, id));
      });
      source.onerror = () => {
        source?.close();
        if (closed) return;
        setConnection("offline");
        attempt += 1;
        retry = setTimeout(connect, Math.min(10_000, 1000 * 2 ** Math.min(attempt, 4)));
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      source?.close();
    };
  }, []);

  const value = useMemo(() => {
    const jobs = Object.values(byId).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { jobs, byId, connection };
  }, [byId, connection]);

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}

export function useJobs() {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error("useJobs must be used inside JobsProvider");
  return ctx;
}

export function isActive(job: Job) {
  return ACTIVE.has(job.status);
}
