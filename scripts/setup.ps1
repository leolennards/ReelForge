# One-time setup for Windows (PowerShell): Python virtualenv + frontend packages.
# Run with:  powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "Checking requirements..."
$python = Get-Command py -ErrorAction SilentlyContinue
if ($python) { $py = @("py", "-3") } else {
  $python = Get-Command python -ErrorAction SilentlyContinue
  if (-not $python) { throw "Python 3.11 or newer is required: https://www.python.org/downloads/" }
  $py = @("python")
}
& $py[0] $py[1..($py.Length)] -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)"
if ($LASTEXITCODE -ne 0) { throw "Python 3.11 or newer is required." }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 20.9 or newer is required: https://nodejs.org/" }

if ((Get-Command ffmpeg -ErrorAction SilentlyContinue) -and (Get-Command ffprobe -ErrorAction SilentlyContinue)) {
  Write-Host "FFmpeg found."
} else {
  Write-Host "FFmpeg was not found. ReelForge needs it to analyse and convert movies."
  Write-Host "  Install it with:  winget install --id Gyan.FFmpeg   (then open a new terminal)"
  Write-Host "Setup will continue; install FFmpeg before converting."
}

Write-Host "Setting up the backend..."
& $py[0] $py[1..($py.Length)] -m venv backend\.venv
& backend\.venv\Scripts\python.exe -m pip install --quiet --upgrade pip
& backend\.venv\Scripts\python.exe -m pip install --quiet -r backend\requirements-dev.txt

Write-Host "Installing frontend packages..."
Push-Location frontend
npm install --silent
Pop-Location
if (-not (Test-Path frontend\.env.local)) { Copy-Item frontend\.env.example frontend\.env.local }

Write-Host ""
Write-Host "Done. Start ReelForge with:  npm run dev"
