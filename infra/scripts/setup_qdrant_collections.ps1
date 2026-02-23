# PowerShell wrapper for Qdrant AgentOS v2 collection setup.
# Usage: .\setup_qdrant_collections.ps1 [-Recreate] [-Collections episodic_memory,skill_triggers]

param(
    [switch]$Recreate,
    [string[]]$Collections
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$pythonScript = Join-Path $scriptDir "setup_qdrant_collections.py"

# Resolve venv — check common locations
$venvCandidates = @(
    (Join-Path (Split-Path $scriptDir -Parent) ".venv\Scripts\python.exe"),
    (Join-Path (Split-Path (Split-Path $scriptDir -Parent) -Parent) ".venv\Scripts\python.exe"),
    (Join-Path $scriptDir ".venv\Scripts\python.exe")
)

$python = $null
foreach ($candidate in $venvCandidates) {
    if (Test-Path $candidate) {
        $python = $candidate
        break
    }
}

if (-not $python) {
    Write-Host "[setup] No venv found at expected paths, falling back to system python." -ForegroundColor Yellow
    $python = "python"
}

$args = @($pythonScript)
if ($Recreate) {
    $args += "--recreate"
}
if ($Collections) {
    $args += "--collections"
    $args += $Collections
}

Write-Host "[setup] Using Python: $python" -ForegroundColor Cyan
Write-Host "[setup] Running: $python $($args -join ' ')" -ForegroundColor Cyan

& $python @args
exit $LASTEXITCODE
