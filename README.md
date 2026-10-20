# ReelForge

**Your movies. Ready for your screen.**

ReelForge is a personal movie conversion studio. Import a downloaded movie, see what's actually inside it, pick your TV, and ReelForge makes the *smallest change needed* for it to play, often just converting the audio, so the picture keeps its original quality.

```
Import → Analyse → Choose device → Optimise → Convert → Verify → Watch
```

Everything runs on your own computer. Movies are never uploaded anywhere.

---

## Contents

- [How it works](#how-it-works)
- [Requirements](#requirements)
- [Installation](#installation)
- [Running ReelForge](#running-reelforge)
- [Using ReelForge](#using-reelforge)
- [Configuration](#configuration)
- [Security and privacy](#security-and-privacy)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Architecture decisions](#architecture-decisions)
- [Features](#features)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)

---

## How it works

ReelForge has two parts that both run locally:

| Part | Technology | Address |
| --- | --- | --- |
| **Web interface** | Next.js (App Router), React, TypeScript, Tailwind CSS, Motion, Lucide | `http://localhost:3000` |
| **Local engine** | Python, FastAPI, FFmpeg and FFprobe | `http://127.0.0.1:8765` |

A browser alone can't reliably convert multi-gigabyte movies, so the browser shows the interface and the local engine does the work with FFmpeg. Progress streams to the page with Server-Sent Events.

For each movie the engine:

1. **Inspects** it with FFprobe: container, codecs, profiles, resolution, frame rate, bitrates, channels, languages, subtitles, chapters.
2. **Assesses compatibility** against a device profile (container, video, audio, subtitles), with plain-language reasons and honest "uncertain" results where support varies by model.
3. **Plans the least destructive conversion**:
   - **No conversion needed**: the file already looks compatible.
   - **Fix audio only**: copy the video untouched, convert just the incompatible audio (for example DTS-HD MA → AAC or AC-3).
   - **Remux**: move compatible streams into a container the TV supports, without re-encoding.
   - **Full conversion**: re-encode video (H.264 by default, quality-based CRF) only when the video itself is unsupported.
   - **Custom**: choose everything yourself.
4. **Converts** with FFmpeg into a hidden temporary file, using `-progress pipe:1` for real progress.
5. **Verifies** the result with FFprobe (readable, right container, expected streams and codecs, matching duration), then moves it into place. Originals are never modified, and existing files are never overwritten.
6. Runs a **TV Ready Check** on the finished file, including the FAT32 4 GiB file-size limit.

## Requirements

- **Python 3.11+**
- **Node.js 20.9+**
- **FFmpeg and FFprobe**, installed separately (ReelForge never assumes they are installed and tells you if they're missing).

### Installing FFmpeg

**macOS** (with [Homebrew](https://brew.sh)):

```bash
brew install ffmpeg
```

**Windows** (with winget, built into Windows 10/11):

```powershell
winget install --id Gyan.FFmpeg
```

Then open a **new** terminal so `ffmpeg` is on your PATH. Alternatively, download a build from <https://www.gyan.dev/ffmpeg/builds/> and add its `bin` folder to PATH, or point ReelForge at it with `REELFORGE_FFMPEG_PATH` / `REELFORGE_FFPROBE_PATH`.

**Linux:** `sudo apt install ffmpeg` (or your distribution's equivalent).

Check it works:

```bash
ffmpeg -version
ffprobe -version
```

## Installation

From the project folder:

**macOS / Linux**

```bash
./scripts/setup.sh
```

**Windows (PowerShell)**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

The setup script checks Python, Node.js and FFmpeg, creates a Python virtual environment in `backend/.venv`, installs the backend packages, and installs the frontend packages.

<details>
<summary>Manual installation</summary>

```bash
# Backend
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements-dev.txt     # Windows: backend\.venv\Scripts\pip

# Frontend
cd frontend
npm install
cp .env.example .env.local
```

</details>

## Running ReelForge

```bash
npm run dev
```

This starts the local engine and the web interface together. Open **<http://localhost:3000>**. Press `Ctrl+C` to stop both.

To run them separately:

```bash
# Terminal 1: local engine
cd backend && .venv/bin/python -m reelforge

# Terminal 2: web interface
cd frontend && npm run dev
```

### Production build

```bash
npm run build                   # builds the web interface
npm run start:web               # serves the built interface on port 3000
cd backend && .venv/bin/python -m reelforge   # in another terminal
```

## Using ReelForge

1. **Dashboard**: drag movies onto the drop zone, or click **Convert a Movie**.
2. **Convert Movie**: two ways to import:
   - **Choose files / drag and drop**: the file is streamed to the engine in chunks (never held in browser memory) and stored as a working copy.
   - **Browse library**: pick a movie inside your configured movie folders. It's converted where it is, with no copying. This is the better choice for very large files.
3. Review the **analysis**, choose a **device profile**, and read the **recommendation**: what changes, what stays the same, and anything that will be left out.
4. Adjust the output name, folder, quality and audio if you like. **Advanced settings** cover containers, codecs, resolution, frame rate, audio tracks, channel layout, subtitles, a separate `.srt` file, metadata, chapters and hardware encoding.
5. Click **Start Conversion**. Follow progress on the page or in the **Conversion Queue**; you can keep working meanwhile.
6. When it finishes, ReelForge shows the verification results, the TV Ready Check, where the file was saved, and buttons to show it in Finder/Explorer or download it.
7. Copy the file to your USB drive and test it on the TV. The **USB drive guide** (on the finished screen and in Device Profiles) explains FAT32, exFAT and NTFS.

**Batch conversion:** tick several movies in the list and choose **Queue**. Each movie gets its own recommendation; movies that don't need converting are skipped.

**Keyboard shortcuts:** `1`–`6` switch pages, `[` collapses the sidebar, `?` lists shortcuts.

### Device profiles

| Profile | Intended for |
| --- | --- |
| Universal USB Playback | Unknown TVs. Conservative: MP4, H.264 up to 1080p, AAC. |
| Samsung Smart TV | Recent Samsung Tizen TVs. Converts DTS audio (widely reported as unsupported on 2018+ models). |
| LG Smart TV | Recent LG webOS TVs. DTS treated as uncertain because it varies by model year. |
| Android TV / Google TV | The built-in player on Android TV / Google TV devices. |
| Custom | Your own. Duplicate a preset or start from scratch. |

These are general profiles based on commonly reported support, **not official manufacturer specifications**. What a TV plays depends on its exact model, model year, firmware, container and codec profile. When unsure, choose Universal.

## Configuration

The engine reads `REELFORGE_*` environment variables. `npm run dev` also loads them from a `.env` file in the project root. See [`.env.example`](.env.example) for the full list. The most useful ones:

| Variable | Default | Purpose |
| --- | --- | --- |
| `REELFORGE_MEDIA_DIRS` | `~/Movies`, `~/Videos`, `~/Downloads`, `~/Desktop` | Folders **Browse library** may read |
| `REELFORGE_OUTPUT_ROOTS` | your home folder | Folders converted files may be written into |
| `REELFORGE_OUTPUT_DIR` | `~/Movies/ReelForge` | Default output folder |
| `REELFORGE_DATA_DIR` | OS app-data folder | Database, logs and imported copies |
| `REELFORGE_MAX_UPLOAD_GB` | `100` | Largest drag-and-drop import |
| `REELFORGE_PORT` | `8765` | Engine port (also update `frontend/.env.local`) |

The web interface reads `NEXT_PUBLIC_REELFORGE_API_URL` from `frontend/.env.local` (default `http://127.0.0.1:8765`).

Everyday preferences (theme, default profile, audio format, quality, concurrent jobs, retention) live in **Settings** and are stored in the local database.

## Security and privacy

ReelForge runs a small web server on your computer that can read movie files and run FFmpeg, so it's locked down:

- **This computer only.** The engine binds to `127.0.0.1` and refuses to start on another address unless `REELFORGE_ALLOW_REMOTE=1` is set deliberately.
- **No DNS rebinding.** Requests must be addressed to `localhost`/`127.0.0.1`.
- **No cross-site use.** Requests carrying a browser `Origin` must come from the configured web interface (CORS is limited to it). Every state-changing request also needs an `X-ReelForge-Client` header, which other websites can't send without a CORS preflight that the engine rejects.
- **No arbitrary commands.** The interface only sends choices from fixed lists (validated with Pydantic). The engine builds FFmpeg's argument list itself from whitelisted codecs, encoders and options, runs it **without a shell**, and prefixes paths with `file:` so a filename can never be read as an FFmpeg protocol.
- **No arbitrary file access.** Movies can only be read from the configured media folders or ReelForge's own import folder, and written inside the configured output roots. Paths are fully resolved (following symlinks) before checking, which blocks `..` and symlink escapes. Hidden files are skipped. Downloads are limited to files ReelForge produced.
- **Safe names and no overwrites.** Output names are sanitised for macOS, Windows and Linux; collisions get ` (2)`, ` (3)`… Conversions write to a hidden temporary file and are renamed into place only after verification.
- **Limits.** Upload size limit, free-space checks before uploading and converting, a per-job time limit, and a stall detector that stops FFmpeg if it stops making progress.
- **No telemetry, no cloud.** Nothing leaves your computer.

**What's stored:** file names, sizes and media details of imported movies; conversion settings, results and timings; your settings and custom profiles. Movie contents are never stored in the database. Full file paths are cleared automatically after a configurable period (7 days by default), and history can be cleared at any time from **Conversion History** or limited in **Settings**. Drag-and-drop working copies are deleted after a successful conversion (configurable).

## Testing

```bash
npm test               # everything
npm run test:backend   # pytest: compatibility rules, planning, commands, API, real FFmpeg jobs
npm run test:frontend  # Vitest + Testing Library: formatting and components
npm run lint
```

Backend tests generate tiny synthetic clips with FFmpeg's built-in test sources (colour bars and a tone), so no real films are involved. Tests that need FFmpeg are skipped automatically when it isn't installed. Covered scenarios include:

1. Compatible H.264 + AAC: no re-encoding.
2. Compatible video with DTS audio: audio converted, video copied.
3. Compatible streams in an unsuitable container: remuxed.
4. Unsupported video codec: video re-encoded.
5. Missing audio stream: clear warning.
6. Unsupported (image-based) subtitles: warned before being left out.
7. Corrupt input: fails gracefully with a useful message.
8. Insufficient disk space: stops before writing anything.
9. Cancellation: FFmpeg is terminated and the partial file removed.
10. Failed output validation: job marked unsuccessful, file discarded.

Plus security tests (foreign hosts and origins, missing client header, path traversal, symlink escapes, hostile filenames, tampered plans), restart recovery, uploads, and settings/profile validation.

## Project structure

```
backend/
  reelforge/
    main.py            FastAPI app factory, error handling, middleware
    __main__.py        `python -m reelforge` entry point (loopback-only by default)
    config.py          Environment-variable configuration
    security.py        Host/Origin/client-header checks
    paths.py           Path confinement, safe filenames, free-space checks
    db.py              SQLite schema, migrations and queries
    app_settings.py    User preferences
    state.py           Shared state, profile storage
    media/             FFmpeg discovery, FFprobe inspection, codec vocabulary
    compat/            Device profiles and the compatibility engine
    planning/          Conversion options, strategy planner, FFmpeg command builder
    jobs/              Queue/runner, progress parsing, output validation
    api/               HTTP routes (media, jobs and history, profiles, settings, SSE)
  tests/               pytest suite and synthetic media generator
frontend/
  src/app/             Pages: dashboard, convert, queue, history, profiles, settings
  src/components/ui/   Buttons, cards, badges, dialogs, tooltips, form controls, feedback
  src/components/      Shell, convert workspace, media, jobs, profiles, settings, providers
  src/lib/             API client, types, formatting, hooks
  src/app/globals.css  Design tokens (dark and light themes)
scripts/               setup.sh, setup.ps1, dev.mjs
```

## Architecture decisions

- **Local engine + web UI.** Browser-only conversion (WebAssembly FFmpeg) is slow and memory-bound for full-length movies. A local FFmpeg gets native speed, hardware encoders and no file-size ceiling, while the web UI stays easy to build and use.
- **Plan on the server, never trust the client.** The browser sends options; the engine re-plans from the stored analysis every time a job is created, and the command builder re-validates every value.
- **One compatibility module.** All rules live in `compat/engine.py` and `planning/planner.py`, so they're unit-testable without FFmpeg and reused for the source analysis and the TV Ready Check.
- **Honest uncertainty.** Profiles list "uncertain" codecs separately. The UI says "Likely compatible" or "Compatibility uncertain", never "guaranteed".
- **Least destructive by default.** Video is copied whenever possible, compatible audio tracks are kept, surround is only downmixed when you choose it or the profile requires it, and the container only changes when needed.
- **SQLite for state.** Jobs, history, profiles and settings survive restarts. Jobs that were running when the engine stopped are marked *interrupted* (with the partial file removed) and can be retried from the start. FFmpeg can't resume a half-written file.
- **Sequential queue by default.** One job at a time keeps the computer responsive; concurrency (up to 4) is a setting.
- **Server-Sent Events** for live updates. One-way, auto-reconnecting, and simple to run locally.

## Features

- Drag-and-drop and multi-file import with streamed uploads, progress and cancel
- In-place import from configured movie folders
- Full FFprobe media inspection
- Compatibility assessment per container, video, audio and subtitles, with reasons
- Four built-in profiles plus your own custom profiles
- Recommended, audio-only, remux, full and custom strategies
- Quality presets, CRF, encoder speed, resolution and frame-rate limits
- Hardware encoding (VideoToolbox, NVENC, Quick Sync, AMF), used only when a test encode succeeds
- Audio track selection, channel layout and bitrate control
- Subtitle handling: keep, convert text subtitles, select one, or none; optional separate `.srt`
- Metadata and chapter preservation
- Queue with real progress, elapsed time, ETA, speed, cancel, retry and clean-up
- Output verification and TV Ready Check, with a USB filesystem guide and checklist
- Conversion history with details, retry, show-in-folder, delete and clear-all
- Settings with validation and reset; dark and light themes; reduced-motion support; keyboard navigation

## Known limitations

- **No real-device testing.** ReelForge verifies files locally; it can't know how your exact TV and firmware behave.
- **Device profiles are general guidance**, not official specifications.
- **HDR to SDR:** re-encoding HDR video to 8-bit H.264 does not apply tone mapping, so colours may look washed out. Prefer keeping the original video or HEVC 10-bit on HDR-capable TVs. Dolby Vision metadata is not preserved when re-encoding.
- **Image-based subtitles** (PGS, VobSub) can't go into MP4 and can't be burned into the picture yet; keep them by choosing MKV.
- **Styled subtitles** (ASS/SSA) lose styling when converted for MP4.
- **No resume.** A canceled or interrupted conversion restarts from the beginning.
- **Output size** is only estimated when no video re-encoding is involved; otherwise ReelForge says it can't be predicted.
- **Browser limits:** a web page can't see a file's real location or pick a folder path. Use **Browse library** to convert in place, and the folder picker (limited to `REELFORGE_OUTPUT_ROOTS`) for outputs.
- **Output containers** are MP4 and MKV only.

## Troubleshooting

**"The local engine isn't running"**: start everything with `npm run dev`. If port 8765 is in use, set `REELFORGE_PORT` and update `NEXT_PUBLIC_REELFORGE_API_URL` in `frontend/.env.local`.

**"FFmpeg is needed"**: install FFmpeg (see above), open a new terminal so PATH updates, restart ReelForge, then click **Check again**. On Windows, `where ffmpeg` should print a path.

**"Requests from this website are not allowed"**: you opened the interface on a different address or port. Use `http://localhost:3000`, or add your address to `REELFORGE_ALLOWED_ORIGINS`.

**A movie isn't in Browse library**: only `REELFORGE_MEDIA_DIRS` folders are listed, hidden files are skipped, and only movie extensions are shown.

**"That location is outside the folders ReelForge is allowed to use"**: choose an output folder inside `REELFORGE_OUTPUT_ROOTS`, or extend that variable.

**"This file could not be read as a movie"**: the file is incomplete, damaged or not a video. Try downloading it again.

**"Not enough free space"**: free up space on the output drive or choose another output folder. ReelForge checks before writing anything.

**Conversion is slow**: "Fix audio only" and "Remux" take seconds to minutes; full video re-encoding can take a long time on CPU. Enable hardware acceleration in Advanced settings if available, or choose a faster encoder speed.

**The TV still won't play the file**: try the **Universal USB Playback** profile, check the drive's filesystem (FAT32 can't hold files of 4 GiB or more), and save subtitles as a separate `.srt` file.

**Logs** are written to `logs/reelforge.log` inside the data folder (see **Settings → System**).
