"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-16">
      <Callout
        tone="danger"
        title="Something went wrong on this page"
        action={
          <Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" />} onClick={reset}>
            Try again
          </Button>
        }
      >
        {error.message || "An unexpected error occurred."} Your conversions keep running in the background.
      </Callout>
    </div>
  );
}
