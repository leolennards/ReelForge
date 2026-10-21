"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";

import { api } from "@/lib/api";

import { Button } from "../ui/button";
import { Callout } from "../ui/feedback";
import { useEngineStatus } from "./status";

/** Explains what to do when the local engine or FFmpeg isn't available. */
export function EngineBanner() {
  const { data, engine } = useEngineStatus();
  const [checking, setChecking] = useState(false);

  if (engine === "down") {
    return (
      <Callout tone="danger" title="The local engine isn't running">
        ReelForge&apos;s processing engine runs on this computer. Start it from the project folder with{" "}
        <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-xs text-fg">npm run dev</code>, which starts
        both parts. This page reconnects automatically.
      </Callout>
    );
  }
  if (data && !data.ffmpeg.available) {
    return (
      <Callout
        tone="warning"
        title="FFmpeg is needed to analyse and convert movies"
        action={
          <Button
            size="sm"
            variant="secondary"
            loading={checking}
            icon={<RefreshCw className="size-4" />}
            onClick={async () => {
              setChecking(true);
              try {
                const result = await api.recheckFfmpeg();
                await mutate("/api/system");
                if (result.available) toast.success("FFmpeg found. You're ready to convert.");
                else toast.error("Still not found", { description: result.error ?? undefined });
              } finally {
                setChecking(false);
              }
            }}
          >
            Check again
          </Button>
        }
      >
        {data.ffmpeg.error} {data.ffmpeg.install_hint}
      </Callout>
    );
  }
  return null;
}
