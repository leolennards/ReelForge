import type { Metadata } from "next";

import { QueueView } from "@/components/jobs/queue-view";

export const metadata: Metadata = { title: "Conversion Queue" };

export default function QueuePage() {
  return <QueueView />;
}
