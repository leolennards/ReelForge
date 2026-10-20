"use client";

import { Info, Loader2, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { api } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { DEFAULT_OPTIONS } from "@/lib/options";
import type { AppSettings, ConversionOptions, DeviceProfile, Job, MediaInfo, MediaItem, PlanResponse, SystemInfo } from "@/lib/types";

import { CompatibilityPanel, PlanSummary } from "../media/compatibility";
import { MediaInspector } from "../media/media-inspector";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Callout, Skeleton } from "../ui/feedback";
import { OutputSettings } from "./output-settings";
import { ModePicker, ProfilePicker } from "./pickers";
import { ResultPanel } from "./result-panel";
import { Step, StepRail } from "./step";

const STEPS = ["Movie", "Analyse", "Device", "Review", "Output", "Convert", "Verify", "Finish"];

/**
 * Steps 1–8 for one movie. Mounted with key={media.id}, so switching movies
 * starts from fresh per-movie settings (track choices, file name).
 */
export function Workspace({
  media,
  info,
  profiles,
  profileId,
  onProfileChange,
  prefs,
  system,
  job,
  onJobCreated,
  onConvertAnother,
}: {
  media: MediaItem;
  info: MediaInfo;
  profiles: DeviceProfile[];
  profileId: string | null;
  onProfileChange: (id: string) => void;
  prefs: AppSettings;
  system: SystemInfo | undefined;
  job: Job | undefined;
  onJobCreated: (jobId: string) => void;
  onConvertAnother: () => void;
}) {
  const [edits, setEdits] = useState<Partial<ConversionOptions>>({});
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const [dirEdit, setDirEdit] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [nameError, setNameError] = useState<string>();

  const options: ConversionOptions = {
    ...DEFAULT_OPTIONS,
    quality: prefs.default_quality,
    external_srt: prefs.external_srt,
    hardware_acceleration: prefs.hardware_acceleration,
    ...edits,
  };
  const update = (patch: Partial<ConversionOptions>) => setEdits((e) => ({ ...e, ...patch }));
  const profile = profiles.find((p) => p.id === profileId) ?? null;
  const hardwareAvailable = (system?.ffmpeg.hardware_encoders.length ?? 0) > 0;

  const plan = useSWR<PlanResponse>(
    profileId ? ["plan", media.id, profileId, JSON.stringify(options)] : null,
    () => api.plan(media.id, profileId!, options),
    { keepPreviousData: true, revalidateOnFocus: false },
  );
  const planData = plan.data;
  const stale = plan.isValidating;
  const outputName = nameEdit ?? planData?.default_output_name ?? "";
  const outputDir = dirEdit ?? prefs.effective_output_dir ?? planData?.default_output_dir ?? "";
  const jobActive = !!job && ["queued", "running", "validating"].includes(job.status);
  const jobDone = job?.status === "completed";

  const currentStep = job
    ? job.status === "completed"
      ? 7
      : job.status === "validating"
        ? 6
        : 5
    : planData
      ? 4
      : profile
        ? 3
        : 2;

  const start = async () => {
    if (!profileId || !planData) return;
    const name = outputName.trim();
    if (!name) {
      setNameError("Enter a name for the converted file.");
      return;
    }
    setNameError(undefined);
    setStarting(true);
    try {
      const created = await api.createJob({
        media_id: media.id,
        profile_id: profileId,
        options,
        output_name: name,
        output_dir: outputDir || null,
      });
      onJobCreated(created.id);
      toast.success("Conversion started", { description: `${media.name} is in the queue.` });
    } catch (err) {
      toast.error("Couldn't start the conversion", { description: (err as Error).message });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="min-w-0 space-y-5">
      <StepRail steps={STEPS} current={currentStep} />

      <Step number={1} title="Movie" done>
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight" title={media.name}>
            {media.name}
          </p>
          <Badge>{formatBytes(media.size)}</Badge>
          <Badge>{media.extension.replace(".", "").toUpperCase()} file</Badge>
          <Badge tone={media.source_kind === "library" ? "info" : "neutral"}>
            {media.source_kind === "library" ? "Converted in place" : "Imported copy"}
          </Badge>
        </div>
        {media.location && <p className="mt-1.5 truncate font-mono text-xs text-faint">{media.location}</p>}
      </Step>

      <Step
        number={2}
        title="Analyse"
        done
        description="What FFprobe found inside the file. File extensions are only a hint; this is the real content."
      >
        <MediaInspector info={info} />
      </Step>

      <Step
        number={3}
        title="Choose a device"
        done={!!profile}
        description="Pick the closest match. Support varies by exact model, model year and firmware."
      >
        <ProfilePicker profiles={profiles} value={profileId ?? ""} onChange={onProfileChange} />
      </Step>

      <Step
        number={4}
        title="Review the recommendation"
        done={!!planData && planData.plan.errors.length === 0}
        disabled={!profile}
        action={stale ? <Loader2 className="size-4 animate-spin text-faint" aria-label="Updating" /> : undefined}
      >
        {plan.error ? (
          <Callout tone="danger" title="Couldn't build a recommendation">
            {(plan.error as Error).message}
          </Callout>
        ) : !planData ? (
          <Skeleton className="h-48" />
        ) : (
          <div className="space-y-6">
            <CompatibilityPanel report={planData.compatibility} profileName={planData.profile.name} />
            <div className="space-y-3">
              <p className="text-sm font-semibold">Strategy</p>
              <ModePicker value={options.mode} onChange={(mode) => update({ mode })} />
              {planData.options.mode !== options.mode && (
                <p className="flex items-center gap-2 text-xs text-muted">
                  <Info className="size-3.5" /> Your settings prefer maximum compatibility, so a full conversion is used.
                </p>
              )}
            </div>
            <div className="rounded-xl border border-accent/20 bg-accent-soft/40 p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge tone="accent">{planData.plan.strategy_label}</Badge>
                {options.mode === "recommended" && <span className="text-xs text-muted">Recommended for this movie</span>}
              </div>
              <PlanSummary plan={planData.plan} />
            </div>
          </div>
        )}
      </Step>

      {planData?.plan.needed === false ? (
        <Callout tone="success" title="No conversion needed">
          Copy the original file to your USB drive and test it on your TV. If it doesn&apos;t play, choose the Universal
          profile or a different strategy above.
        </Callout>
      ) : (
        <>
          <Step number={5} title="Configure output" disabled={!planData}>
            {planData && (
              <OutputSettings
                info={info}
                options={options}
                update={update}
                plan={planData}
                outputName={outputName}
                setOutputName={setNameEdit}
                outputDir={outputDir}
                setOutputDir={setDirEdit}
                hardwareAvailable={hardwareAvailable}
                nameError={nameError}
              />
            )}
          </Step>

          <Step
            number={6}
            title="Convert"
            done={!!job}
            disabled={!planData}
            description="Conversions run one after another in the background. You can keep using ReelForge while they run."
          >
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                size="lg"
                icon={<Play className="size-5" />}
                loading={starting}
                disabled={
                  !planData ||
                  planData.plan.errors.length > 0 ||
                  jobActive ||
                  jobDone ||
                  stale ||
                  !system?.ffmpeg.available
                }
                onClick={start}
              >
                {jobActive ? "Conversion in progress" : jobDone ? "Converted" : job ? "Start again" : "Start Conversion"}
              </Button>
              {planData && planData.plan.errors.length > 0 && (
                <p className="text-sm text-danger">Fix the issues in step 4 before converting.</p>
              )}
              {system && !system.ffmpeg.available && <p className="text-sm text-warning">FFmpeg is required to convert.</p>}
            </div>
          </Step>
        </>
      )}

      {job && <ResultPanel job={job} onConvertAnother={onConvertAnother} />}
    </div>
  );
}
