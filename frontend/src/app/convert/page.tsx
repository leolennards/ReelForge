import type { Metadata } from "next";
import { Suspense } from "react";

import { ConvertView } from "@/components/convert/convert-view";
import { Skeleton } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Convert Movie" };

export default function ConvertPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <ConvertView />
    </Suspense>
  );
}
