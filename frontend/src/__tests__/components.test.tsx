import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CompatibilityPanel, PlanSummary, TvReadyCheck } from "@/components/media/compatibility";
import { Progress } from "@/components/ui/feedback";
import { Segmented } from "@/components/ui/form";
import type { CompatibilityReport, ConversionPlan } from "@/lib/types";

const report: CompatibilityReport = {
  profile_id: "samsung",
  overall: "audio_conversion",
  overall_label: "Audio conversion recommended",
  disclaimer: "Not a guarantee.",
  areas: {
    container: { status: "compatible", label: "Likely compatible", reasons: [] },
    video: { status: "compatible", label: "Likely compatible", reasons: [] },
    audio: { status: "convert", label: "Change recommended", reasons: ["Samsung may not support DTS-HD MA audio."] },
    subtitles: { status: "not_applicable", label: "Not applicable", reasons: [] },
  },
};

const plan: ConversionPlan = {
  strategy: "audio_fix",
  strategy_label: "Fix audio only",
  needed: true,
  container: "mkv",
  extension: ".mkv",
  actions: [],
  video_encode: null,
  summary: "ReelForge will keep the original video stream and convert the audio to AC-3.",
  keeps: ["Original H.265 (HEVC) video (no quality loss)"],
  changes: ["Convert DTS-HD MA 5.1 audio to AC-3"],
  warnings: ["1 attachment(s) will be left out."],
  errors: [],
  estimated_size: null,
  estimate_note: "",
};

describe("compatibility components", () => {
  it("shows the overall verdict and reasons", () => {
    render(<CompatibilityPanel report={report} profileName="Samsung Smart TV" />);
    expect(screen.getByText("Audio conversion recommended")).toBeInTheDocument();
    expect(screen.getByText(/may not support DTS-HD MA/)).toBeInTheDocument();
    expect(screen.getByText("Not a guarantee.")).toBeInTheDocument();
  });

  it("explains what changes, what stays and warnings", () => {
    render(<PlanSummary plan={plan} />);
    expect(screen.getByText(/keep the original video stream/)).toBeInTheDocument();
    expect(screen.getByText("What changes")).toBeInTheDocument();
    expect(screen.getByText("What stays the same")).toBeInTheDocument();
    expect(screen.getByText(/attachment/)).toBeInTheDocument();
  });

  it("states the TV Ready Check is not a guarantee", () => {
    render(<TvReadyCheck items={[{ key: "file_size", status: "warn", title: "USB file size", detail: "Larger than 4 GiB." }]} />);
    expect(screen.getByText("USB file size")).toBeInTheDocument();
    expect(screen.getByText(/not a guarantee/)).toBeInTheDocument();
  });
});

describe("ui primitives", () => {
  it("never shows a fake percentage for unknown progress", () => {
    const { rerender } = render(<Progress value={null} label="Converting" />);
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    rerender(<Progress value={42.4} label="Converting" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
  });

  it("segmented control is keyboard operable", async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        ariaLabel="Quality"
        value="balanced"
        onChange={onChange}
        options={[
          { value: "high", label: "High" },
          { value: "balanced", label: "Balanced" },
          { value: "compact", label: "Compact" },
        ]}
      />,
    );
    const current = screen.getByRole("radio", { name: "Balanced" });
    expect(current).toHaveAttribute("aria-checked", "true");
    current.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("compact");
  });
});
