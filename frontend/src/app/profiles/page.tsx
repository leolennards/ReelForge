import type { Metadata } from "next";

import { ProfilesView } from "@/components/profiles/profiles-view";

export const metadata: Metadata = { title: "Device Profiles" };

export default function ProfilesPage() {
  return <ProfilesView />;
}
