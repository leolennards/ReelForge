#!/usr/bin/env bash
# One-time setup for macOS and Linux: Python virtualenv + frontend packages.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Checking requirements..."
PYTHON="${PYTHON:-python3}"
if ! command -v "$PYTHON" >/dev/null 2>&1; then
  echo "Python 3.11 or newer is required: https://www.python.org/downloads/" >&2
  exit 1
fi
"$PYTHON" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' || {
  echo "Python 3.11 or newer is required (found $("$PYTHON" --version))." >&2
  exit 1
}
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20.9 or newer is required: https://nodejs.org/" >&2
  exit 1
fi

if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
  echo "FFmpeg found: $(ffmpeg -hide_banner -version | head -n1)"
else
  echo "FFmpeg was not found. ReelForge needs it to analyse and convert movies."
  if [[ "$(uname)" == "Darwin" ]]; then
    echo "  Install it with Homebrew:  brew install ffmpeg"
  else
    echo "  Install it with your package manager, e.g.:  sudo apt install ffmpeg"
  fi
  echo "Setup will continue; install FFmpeg before converting."
fi

echo "Setting up the backend..."
"$PYTHON" -m venv backend/.venv
backend/.venv/bin/python -m pip install --quiet --upgrade pip
backend/.venv/bin/python -m pip install --quiet -r backend/requirements-dev.txt

echo "Installing frontend packages..."
(cd frontend && npm install --silent)
[[ -f frontend/.env.local ]] || cp frontend/.env.example frontend/.env.local

echo
echo "Done. Start ReelForge with:  npm run dev"
