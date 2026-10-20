import { Clapperboard, History, LayoutDashboard, ListVideo, MonitorSmartphone, Settings } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, shortcut: "1" },
  { href: "/convert", label: "Convert Movie", icon: Clapperboard, shortcut: "2" },
  { href: "/queue", label: "Conversion Queue", icon: ListVideo, shortcut: "3" },
  { href: "/history", label: "Conversion History", icon: History, shortcut: "4" },
  { href: "/profiles", label: "Device Profiles", icon: MonitorSmartphone, shortcut: "5" },
  { href: "/settings", label: "Settings", icon: Settings, shortcut: "6" },
] as const;

export function titleFor(pathname: string) {
  const match = [...NAV_ITEMS].sort((a, b) => b.href.length - a.href.length).find((n) =>
    n.href === "/" ? pathname === "/" : pathname.startsWith(n.href),
  );
  return match?.label ?? "ReelForge";
}
