// Client for the local ReelForge API. All requests go to this computer only.

import type {
  AppSettings,
  ConversionOptions,
  DeviceProfile,
  DirListing,
  Job,
  LibraryListing,
  LibraryRoot,
  MediaItem,
  PlanResponse,
  ProfileOptions,
  Stats,
  SystemInfo,
} from "./types";
import { DEMO, DEMO_MESSAGE, demoRequest } from "./demo";

export const API_URL = (process.env.NEXT_PUBLIC_REELFORGE_API_URL || "http://127.0.0.1:8765").replace(
  /\/$/,
  "",
);

// Required by the API for anything that changes state (see backend security.py).
const CLIENT_HEADER = { "X-ReelForge-Client": "1" };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class BackendOfflineError extends ApiError {
  constructor() {
    super("ReelForge's local engine isn't running. Start it and try again.", 0);
  }
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length) {
      const first = detail[0] as { msg?: string; loc?: unknown[] };
      const field = Array.isArray(first.loc) ? first.loc.slice(1).join(".") : "";
      return `${field ? field + ": " : ""}${first.msg ?? "Invalid value"}`;
    }
  }
  return `Request failed (${status}).`;
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (DEMO) {
    try {
      return await demoRequest<T>(path, init);
    } catch {
      throw new ApiError(DEMO_MESSAGE, 403);
    }
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init.body && !(init.body instanceof Blob) ? { "Content-Type": "application/json" } : {}),
        ...CLIENT_HEADER,
        ...init.headers,
      },
    });
  } catch {
    throw new BackendOfflineError();
  }
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new ApiError(errorMessage(body, response.status), response.status);
  return body as T;
}

const json = (method: string, data?: unknown): RequestInit => ({
  method,
  body: data === undefined ? undefined : JSON.stringify(data),
});

export const fetcher = <T>(path: string) => request<T>(path);

export const api = {
  system: () => request<SystemInfo>("/api/system"),
  recheckFfmpeg: () => request<SystemInfo["ffmpeg"]>("/api/system/recheck", json("POST")),
  stats: () => request<Stats>("/api/stats"),

  libraryRoots: () => request<LibraryRoot[]>("/api/library/roots"),
  browseLibrary: (root: number, path = "") =>
    request<LibraryListing>(`/api/library/browse?root=${root}&path=${encodeURIComponent(path)}`),
  importLibrary: (root: number, path: string) =>
    request<MediaItem>("/api/media/library", json("POST", { root, path })),
  listMedia: () => request<MediaItem[]>("/api/media"),
  removeMedia: (id: string) => request<{ status: string }>(`/api/media/${id}`, json("DELETE")),

  plan: (mediaId: string, profileId: string, options: Partial<ConversionOptions>) =>
    request<PlanResponse>(
      "/api/plan",
      json("POST", { media_id: mediaId, profile_id: profileId, options }),
    ),
  createJob: (body: {
    media_id: string;
    profile_id: string;
    options: Partial<ConversionOptions>;
    output_name?: string;
    output_dir?: string | null;
  }) => request<Job>("/api/jobs", json("POST", body)),
  createBatch: (mediaIds: string[], profileId: string, options: Partial<ConversionOptions>) =>
    request<{ created: Job[]; skipped: { media_id: string; name?: string; reason: string }[] }>(
      "/api/jobs/batch",
      json("POST", { media_ids: mediaIds, profile_id: profileId, options }),
    ),
  cancelJob: (id: string) => request(`/api/jobs/${id}/cancel`, json("POST")),
  retryJob: (id: string) => request<Job>(`/api/jobs/${id}/retry`, json("POST")),
  hideJob: (id: string) => request(`/api/jobs/${id}/hide`, json("POST")),
  hideFinished: () => request<{ hidden: number }>("/api/jobs/hide-finished", json("POST")),
  revealJob: (id: string) => request(`/api/jobs/${id}/reveal`, json("POST")),
  downloadUrl: (id: string) => `${API_URL}/api/jobs/${id}/download`,
  subtitlesUrl: (id: string) => `${API_URL}/api/jobs/${id}/subtitles`,

  history: () => request<Job[]>("/api/history"),
  deleteHistory: (id: string) => request(`/api/history/${id}`, json("DELETE")),
  clearHistory: () => request<{ deleted: number }>("/api/history", json("DELETE")),

  profiles: () => request<DeviceProfile[]>("/api/profiles"),
  profileOptions: () => request<ProfileOptions>("/api/profiles/options"),
  saveProfile: (profile: DeviceProfile) =>
    request<DeviceProfile>(`/api/profiles/${profile.id}`, json("PUT", profile)),
  deleteProfile: (id: string) => request(`/api/profiles/${id}`, json("DELETE")),

  settings: () => request<AppSettings>("/api/settings"),
  saveSettings: (settings: AppSettings) => request<AppSettings>("/api/settings", json("PUT", settings)),
  resetSettings: () => request<AppSettings>("/api/settings/reset", json("POST")),
  listDirs: (path?: string | null) =>
    request<DirListing>(`/api/fs/dirs${path ? `?path=${encodeURIComponent(path)}` : ""}`),
};

export interface UploadHandle {
  promise: Promise<MediaItem>;
  abort: () => void;
}

/**
 * Upload a file by streaming it as the request body. The browser reads the
 * file from disk as it sends, so large movies never sit in page memory.
 */
export function uploadFile(file: File, onProgress: (fraction: number) => void): UploadHandle {
  if (DEMO) return { promise: Promise.reject(new ApiError(DEMO_MESSAGE, 403)), abort: () => {} };
  const xhr = new XMLHttpRequest();
  const promise = new Promise<MediaItem>((resolve, reject) => {
    xhr.open("PUT", `${API_URL}/api/media/upload`);
    xhr.setRequestHeader("X-ReelForge-Client", "1");
    xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as MediaItem);
      else reject(new ApiError(errorMessage(body, xhr.status), xhr.status));
    };
    xhr.onerror = () => reject(new BackendOfflineError());
    xhr.onabort = () => reject(new ApiError("Upload canceled.", 499));
    xhr.send(file);
  });
  return { promise, abort: () => xhr.abort() };
}
