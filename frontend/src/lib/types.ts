// Types mirroring the local API's JSON responses.

export interface VideoStream {
  index: number;
  codec: string;
  codec_label: string;
  profile: string | null;
  level: number | null;
  width: number | null;
  height: number | null;
  pix_fmt: string | null;
  bit_depth: number;
  fps: number | null;
  bitrate: number | null;
  hdr: string | null;
  dolby_vision: boolean;
  language: string | null;
  title: string | null;
  default: boolean;
}

export interface AudioStream {
  index: number;
  codec: string;
  codec_label: string;
  profile: string | null;
  channels: number | null;
  channel_layout: string | null;
  sample_rate: number | null;
  bitrate: number | null;
  language: string | null;
  title: string | null;
  default: boolean;
}

export interface SubtitleStream {
  index: number;
  codec: string;
  codec_label: string;
  kind: "text" | "bitmap" | "other";
  language: string | null;
  title: string | null;
  default: boolean;
  forced: boolean;
}

export interface MediaInfo {
  container: string;
  container_label: string;
  format_name: string | null;
  size: number;
  duration: number | null;
  bitrate: number | null;
  title: string | null;
  video: VideoStream[];
  audio: AudioStream[];
  subtitles: SubtitleStream[];
  attachments: number;
  data_streams: number;
  chapters: number;
  primary_video: number | null;
  primary_audio: number | null;
}

export interface MediaItem {
  id: string;
  name: string;
  size: number;
  extension: string;
  source_kind: "upload" | "library";
  location: string | null;
  created_at: string;
  info: MediaInfo | null;
  languages: string[];
}

export interface DeviceProfile {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  containers: string[];
  video_codecs: string[];
  video_uncertain: string[];
  audio_codecs: string[];
  audio_uncertain: string[];
  subtitle_codecs: string[];
  max_width: number;
  max_height: number;
  max_fps: number;
  max_bit_depth: Record<string, number>;
  max_audio_channels: number;
  preferred_container: "mp4" | "mkv";
  preferred_video_codec: "h264" | "hevc";
  preferred_audio_codec: "aac" | "ac3" | "eac3" | "mp3";
  subtitle_preference: "keep_compatible" | "first_only" | "none";
  priority: "quality" | "compatibility";
  notes: string[];
}

export interface CodecOption {
  id: string;
  label: string;
}

export interface ProfileOptions {
  containers: CodecOption[];
  output_containers: string[];
  video_codecs: CodecOption[];
  audio_codecs: CodecOption[];
  subtitle_codecs: CodecOption[];
  template: DeviceProfile;
}

export type Mode = "recommended" | "audio_only" | "remux" | "full" | "custom";
export type Quality = "high" | "balanced" | "compact";

export interface ConversionOptions {
  mode: Mode;
  container: "auto" | "mp4" | "mkv";
  video_codec: "auto" | "copy" | "h264" | "hevc";
  quality: Quality;
  crf: number | null;
  encoder_preset: "veryfast" | "faster" | "fast" | "medium" | "slow";
  max_height: 0 | 480 | 720 | 1080 | 1440 | 2160;
  frame_rate: "keep" | "24" | "25" | "30" | "50" | "60";
  audio_codec: "auto" | "copy" | "aac" | "ac3" | "eac3" | "mp3";
  audio_bitrate_kbps: number | null;
  audio_channels: "auto" | "stereo" | "5.1";
  audio_tracks: "all" | "primary" | "selected";
  audio_stream: number | null;
  subtitles: "auto" | "keep_compatible" | "first_only" | "selected" | "none";
  subtitle_stream: number | null;
  external_srt: boolean;
  keep_metadata: boolean;
  keep_chapters: boolean;
  hardware_acceleration: boolean;
}

export type AreaStatus = "compatible" | "convert" | "uncertain" | "missing" | "not_applicable";

export interface AreaVerdict {
  status: AreaStatus;
  label: string;
  reasons: string[];
}

export interface CompatibilityReport {
  profile_id: string;
  overall: "likely_compatible" | "remux_recommended" | "audio_conversion" | "video_conversion" | "uncertain";
  overall_label: string;
  areas: Record<"container" | "video" | "audio" | "subtitles", AreaVerdict>;
  disclaimer: string;
}

export interface StreamAction {
  kind: "video" | "audio" | "subtitle";
  source_index: number;
  action: "copy" | "encode" | "drop";
  source_label: string;
  target_codec: string | null;
  target_label: string | null;
  channels: number | null;
  bitrate_kbps: number | null;
  language: string | null;
  reason: string;
}

export type Strategy = "none" | "remux" | "audio_fix" | "full" | "custom";

export interface ConversionPlan {
  strategy: Strategy;
  strategy_label: string;
  needed: boolean;
  container: "mp4" | "mkv";
  extension: string;
  actions: StreamAction[];
  video_encode: {
    codec: string;
    encoder: string;
    hardware: boolean;
    crf: number | null;
    quality: number | null;
    preset: string | null;
    scale: [number, number] | null;
    fps: number | null;
  } | null;
  summary: string;
  keeps: string[];
  changes: string[];
  warnings: string[];
  errors: string[];
  estimated_size: number | null;
  estimate_note: string;
}

export interface PlanResponse {
  media_id: string;
  profile: DeviceProfile;
  options: ConversionOptions;
  compatibility: CompatibilityReport;
  plan: ConversionPlan;
  command_preview: string[] | null;
  default_output_name: string;
  default_output_dir: string;
}

export type JobStatus =
  | "queued"
  | "running"
  | "validating"
  | "completed"
  | "failed"
  | "canceled"
  | "interrupted";

export interface ValidationCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ReadyItem {
  key: string;
  status: "pass" | "warn" | "fail" | "info";
  title: string;
  detail: string;
}

export interface Job {
  id: string;
  media_id: string;
  source_name: string;
  source_size: number;
  profile_id: string;
  profile_name: string;
  strategy: Strategy;
  strategy_label: string;
  status: JobStatus;
  progress: number | null;
  eta_seconds: number | null;
  speed: number | null;
  message: string | null;
  error: string | null;
  output_name: string;
  output_path: string | null;
  output_dir: string | null;
  output_available: boolean;
  srt_available: boolean;
  output_size: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  validation: { ok: boolean; checks: ValidationCheck[] } | null;
  ready: ReadyItem[] | null;
  plan: {
    summary: string;
    container: string;
    changes: string[];
    keeps: string[];
    warnings: string[];
  };
  options: ConversionOptions;
  queue_hidden: boolean;
  retry_of: string | null;
}

export interface FFmpegInfo {
  available: boolean;
  ffmpeg_found: boolean;
  ffprobe_found: boolean;
  version: string | null;
  video_encoders: string[];
  audio_encoders: string[];
  hardware_encoders: string[];
  error: string | null;
  install_hint: string | null;
}

export interface SystemInfo {
  app: string;
  version: string;
  local_only: boolean;
  ffmpeg: FFmpegInfo;
  media_dirs: string[];
  output_roots: string[];
  output_dir: string | null;
  output_free_bytes: number | null;
  max_upload_bytes: number;
  data_dir: string;
  stored_data: string[];
}

export interface AppSettings {
  theme: "dark" | "light" | "system";
  output_dir: string | null;
  default_profile_id: string;
  default_audio_codec: "auto" | "aac" | "ac3" | "eac3";
  default_quality: Quality;
  max_concurrent_jobs: number;
  hardware_acceleration: boolean;
  processing_behaviour: "smallest_change" | "max_compatibility";
  external_srt: boolean;
  delete_uploads_after_success: boolean;
  history_retention_days: 0 | 7 | 30 | 90 | 365;
  path_retention_days: 1 | 7 | 30;
  usb_size_check: boolean;
  effective_output_dir?: string;
}

export interface Stats {
  completed: number;
  failed: number;
  canceled: number;
  queued: number;
  active: number;
  output_bytes: number;
  imported: number;
  last_profile: DeviceProfile | null;
}

export interface LibraryRoot {
  id: number;
  name: string;
  path: string;
  exists: boolean;
}

export interface LibraryListing {
  root: number;
  path: string;
  parent: string | null;
  dirs: { name: string; path: string }[];
  files: { name: string; path: string; size: number; extension: string }[];
}

export interface DirListing {
  path: string | null;
  parent: string | null;
  dirs: { name: string; path: string }[];
}
