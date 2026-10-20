"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";

import type { AppSettings, DeviceProfile, Job, MediaItem, Stats, SystemInfo } from "./types";

export function useSystem() {
  return useSWR<SystemInfo>("/api/system", { refreshInterval: 15_000, shouldRetryOnError: true, errorRetryInterval: 4000 });
}

export function useProfiles() {
  return useSWR<DeviceProfile[]>("/api/profiles");
}

export function useSettings() {
  return useSWR<AppSettings>("/api/settings");
}

export function useStats() {
  return useSWR<Stats>("/api/stats", { refreshInterval: 20_000 });
}

export function useMedia() {
  return useSWR<MediaItem[]>("/api/media");
}

export function useHistory() {
  return useSWR<Job[]>("/api/history");
}

/** Re-renders every `ms` milliseconds while `active` is true (for live timers). */
export function useNow(active: boolean, ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}
