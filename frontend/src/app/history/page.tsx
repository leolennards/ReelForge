import type { Metadata } from "next";

import { HistoryView } from "@/components/jobs/history-view";

export const metadata: Metadata = { title: "Conversion History" };

export default function HistoryPage() {
  return <HistoryView />;
}
