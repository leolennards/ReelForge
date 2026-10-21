// Hosted demo mode (NEXT_PUBLIC_REELFORGE_DEMO=1). There is no engine behind
// the demo, so reads are answered from responses recorded from a real engine
// by scripts/capture-demo.mjs, and anything that would change state is refused.

import type { Job } from "./types";

export const DEMO = process.env.NEXT_PUBLIC_REELFORGE_DEMO === "1";

export const DEMO_REPO_URL = "https://github.com/leolennards/ReelForge";

export const DEMO_MESSAGE =
  "This is a read-only demo. Install ReelForge on your computer to import and convert your own movies.";

interface DemoData {
  responses: Record<string, unknown>;
  plans: Record<string, unknown>;
}

let data: Promise<DemoData> | null = null;
const load = () => (data ??= import("./demo-data.json").then((m) => m.default as unknown as DemoData));

export async function demoRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { responses, plans } = await load();
  const method = (init.method ?? "GET").toUpperCase();

  if (method === "POST" && path === "/api/plan") {
    const body = JSON.parse(String(init.body)) as {
      media_id: string;
      profile_id: string;
      options: { mode?: string };
    };
    const key = `${body.media_id}:${body.profile_id}:`;
    const plan = plans[key + (body.options.mode ?? "recommended")] ?? plans[key + "recommended"];
    if (!plan) throw new Error(DEMO_MESSAGE);
    return plan as T;
  }
  if (method !== "GET") throw new Error(DEMO_MESSAGE);

  const found = responses[path] ?? responses[path.split("?")[0]];
  if (found === undefined) throw new Error(DEMO_MESSAGE);
  return structuredClone(found) as T;
}

export async function demoJobs(): Promise<Job[]> {
  return demoRequest<Job[]>("/api/jobs");
}
