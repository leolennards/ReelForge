import { Compass } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

export default function NotFound() {
  return (
    <EmptyState
      icon={<Compass className="size-5" />}
      title="Page not found"
      description="That page doesn't exist in ReelForge."
      action={
        <ButtonLink href="/" variant="primary" size="sm">
          Back to the dashboard
        </ButtonLink>
      }
    />
  );
}
