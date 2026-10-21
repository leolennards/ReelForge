import { ExternalLink } from "lucide-react";

import { DEMO, DEMO_REPO_URL } from "@/lib/demo";

import { Callout } from "../ui/feedback";

/** Shown on every page of the hosted demo, which has no engine behind it. */
export function DemoBanner() {
  if (!DEMO) return null;
  return (
    <Callout
      className="mb-6"
      title="You're viewing a read-only demo"
      action={
        <a
          href={DEMO_REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 shrink-0 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[13px] font-medium hover:border-line-strong hover:bg-surface-hover"
        >
          <ExternalLink className="size-4" />
          Get ReelForge
        </a>
      }
    >
      ReelForge converts movies on your own computer, so this hosted copy can&apos;t import or convert anything. The
      movies, analysis, recommendations and history below were recorded from a real ReelForge run.
    </Callout>
  );
}
