#!/usr/bin/env node
// Records real responses from a running engine into the data used by the
// hosted demo (NEXT_PUBLIC_REELFORGE_DEMO=1). Run it against an engine whose
// library contains a few sample movies that have already been converted.
//
// Usage: node scripts/capture-demo.mjs [engine-url] [path-to-hide]
//   path-to-hide is replaced with /Users/you so no local paths are published.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const engine = (process.argv[2] || "http://127.0.0.1:8765").replace(/\/$/, "");
const hide = process.argv[3];
const out = join(root, "frontend", "src", "lib", "demo-data.json");
const MODES = ["recommended", "audio_only", "remux", "full", "custom"];

async function get(path, init) {
  const response = await fetch(engine + path, {
    ...init,
    headers: { "X-ReelForge-Client": "1", "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

const responses = {};
for (const path of [
  "/api/system",
  "/api/stats",
  "/api/media",
  "/api/profiles",
  "/api/profiles/options",
  "/api/settings",
  "/api/history",
  "/api/jobs",
  "/api/library/roots",
]) {
  responses[path] = await get(path);
}

for (const [index] of responses["/api/library/roots"].entries()) {
  const path = `/api/library/browse?root=${index}&path=`;
  responses[path] = await get(path);
}

const plans = {};
for (const media of responses["/api/media"]) {
  responses[`/api/media/${media.id}`] = await get(`/api/media/${media.id}`);
  for (const profile of responses["/api/profiles"]) {
    for (const mode of MODES) {
      plans[`${media.id}:${profile.id}:${mode}`] = await get("/api/plan", {
        method: "POST",
        body: JSON.stringify({ media_id: media.id, profile_id: profile.id, options: { mode } }),
      });
    }
  }
}

let text = JSON.stringify({ captured_at: new Date().toISOString(), responses, plans });
if (hide) text = text.split(hide).join("/Users/you");
writeFileSync(out, text + "\n");
console.log(`Wrote ${Object.keys(responses).length} responses and ${Object.keys(plans).length} plans to ${out}`);
