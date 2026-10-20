import { describe, expect, it } from "vitest";

import { channelsLabel, formatBytes, formatDuration, languageName, resolutionLabel, stem } from "@/lib/format";

describe("format helpers", () => {
  it("formats byte sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(4 * 1024 ** 3)).toBe("4.0 GB");
    expect(formatBytes(null)).toBe("—");
  });

  it("formats durations", () => {
    expect(formatDuration(42)).toBe("42s");
    expect(formatDuration(125)).toBe("2m 05s");
    expect(formatDuration(3 * 3600 + 120)).toBe("3h 02m");
    expect(formatDuration(undefined)).toBe("—");
  });

  it("names channels, resolutions and languages", () => {
    expect(channelsLabel(6)).toBe("5.1");
    expect(channelsLabel(2)).toBe("Stereo");
    expect(resolutionLabel(3840, 2160)).toContain("4K");
    expect(resolutionLabel(1920, 800)).toContain("1080p");
    expect(languageName("eng")).toBe("English");
    expect(languageName(null)).toBe("Unknown language");
  });

  it("strips extensions", () => {
    expect(stem("Movie.Name.2024.mkv")).toBe("Movie.Name.2024");
    expect(stem(".hidden")).toBe(".hidden");
  });
});
