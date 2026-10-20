import type { ConversionOptions } from "./types";

// Mirrors the backend's ConversionOptions defaults.
export const DEFAULT_OPTIONS: ConversionOptions = {
  mode: "recommended",
  container: "auto",
  video_codec: "auto",
  quality: "balanced",
  crf: null,
  encoder_preset: "medium",
  max_height: 0,
  frame_rate: "keep",
  audio_codec: "auto",
  audio_bitrate_kbps: null,
  audio_channels: "auto",
  audio_tracks: "all",
  audio_stream: null,
  subtitles: "auto",
  subtitle_stream: null,
  external_srt: false,
  keep_metadata: true,
  keep_chapters: true,
  hardware_acceleration: false,
};
