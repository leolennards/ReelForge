// Formatting helpers shared by the UI. Pure functions; unit-tested.

export function formatBytes(bytes: number | null | undefined, digits = 1): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 100 ? 0 : digits)} ${units[unit]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (m) return `${m}m ${sec.toString().padStart(2, "0")}s`;
  return `${sec}s`;
}

export function formatRuntime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "Unknown";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

export function formatBitrate(bps: number | null | undefined): string {
  if (!bps) return "—";
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mb/s`;
  return `${Math.round(bps / 1000)} kb/s`;
}

export function channelsLabel(channels: number | null | undefined, layout?: string | null): string {
  if (!channels) return "—";
  const named: Record<number, string> = { 1: "Mono", 2: "Stereo", 6: "5.1", 8: "7.1" };
  return named[channels] ?? layout ?? `${channels} ch`;
}

export function resolutionLabel(width: number | null, height: number | null): string {
  if (!width || !height) return "—";
  const tag =
    height >= 2000 || width >= 3800
      ? "4K"
      : height >= 1400
        ? "1440p"
        : height >= 1000 || width >= 1900
          ? "1080p"
          : height >= 700
            ? "720p"
            : "SD";
  return `${width}×${height} · ${tag}`;
}

const LANGUAGES: Record<string, string> = {
  eng: "English", en: "English", fra: "French", fre: "French", fr: "French", deu: "German",
  ger: "German", de: "German", spa: "Spanish", es: "Spanish", ita: "Italian", it: "Italian",
  jpn: "Japanese", ja: "Japanese", kor: "Korean", zho: "Chinese", chi: "Chinese", por: "Portuguese",
  rus: "Russian", nld: "Dutch", dut: "Dutch", swe: "Swedish", nor: "Norwegian", dan: "Danish",
  fin: "Finnish", pol: "Polish", tur: "Turkish", ara: "Arabic", hin: "Hindi", heb: "Hebrew",
};

export function languageName(code: string | null | undefined): string {
  if (!code) return "Unknown language";
  return LANGUAGES[code.toLowerCase()] ?? code.toUpperCase();
}

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const diff = Math.round((now - then) / 1000);
  if (diff < 45) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.round(diff / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

export function elapsedSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.max(0, (now - new Date(iso).getTime()) / 1000);
}

export function stem(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i > 0 ? filename.slice(0, i) : filename;
}
