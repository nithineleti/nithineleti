$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
if (-not (Test-Path ".venv")) {
    python -m venv .venv
    .\.venv\Scripts\python.exe -m pip install -e ".\backend[dev]"
}
$env:PYTHONPATH = "backend"
.\.venv\Scripts\python.exe -m app.demo
