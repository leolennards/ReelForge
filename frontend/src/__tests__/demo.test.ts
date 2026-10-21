import { describe, expect, it } from "vitest";

import { DEMO_MESSAGE, demoRequest } from "@/lib/demo";
import data from "@/lib/demo-data.json";
import type { MediaItem, PlanResponse } from "@/lib/types";

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

describe("demo data", () => {
  it("answers reads with recorded engine responses", async () => {
    const media = await demoRequest<MediaItem[]>("/api/media");
    expect(media.length).toBeGreaterThan(0);
    const one = await demoRequest<MediaItem>(`/api/media/${media[0].id}`);
    expect(one.id).toBe(media[0].id);
  });

  it("looks up plans by movie, profile and strategy", async () => {
    const [media] = await demoRequest<MediaItem[]>("/api/media");
    const plan = await demoRequest<PlanResponse>(
      "/api/plan",
      post({ media_id: media.id, profile_id: "universal", options: { mode: "full" } }),
    );
    expect(plan.plan.strategy).toBe("full");
  });

  it("refuses anything that would change state", async () => {
    await expect(demoRequest("/api/jobs", post({}))).rejects.toThrow(DEMO_MESSAGE);
    await expect(demoRequest("/api/settings", { method: "PUT", body: "{}" })).rejects.toThrow(DEMO_MESSAGE);
  });

  it("contains no local paths other than the placeholder home folder", () => {
    const paths = JSON.stringify(data).match(/\/Users\/[^/"]+/g) ?? [];
    expect(new Set(paths)).toEqual(new Set(["/Users/you"]));
  });
});
