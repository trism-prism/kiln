#requires -Version 7
# scripts/check.ps1: the deterministic "done" gate for humans, agents, Orca automations and CI.
#   pwsh -NoProfile -File scripts/check.ps1 -Tier fast|quick|full
#   fast: lint      quick: + typecheck, unit tests, worker typecheck + tests      full: + build, Playwright e2e (mirrors .github/workflows/ci.yml)
# Exit code 0 = pass. Keep each step a real command; no prose checks.
param([ValidateSet('fast', 'quick', 'full')][string]$Tier = 'quick')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
$failed = @()
function Step([string]$Name, [string[]]$Tiers, [scriptblock]$Run) {
    if ($Tiers -notcontains $script:Tier) { return }
    Write-Host "-> $Name" -ForegroundColor Cyan
    try { & $Run; if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "exit $LASTEXITCODE" } }
    catch { Write-Host "   FAILED: $Name ($_)" -ForegroundColor Red; $script:failed += $Name }
}
try {
    Step 'lint' @('fast', 'quick', 'full') { npm run lint --silent }
    Step 'typecheck' @('quick', 'full') { npm run typecheck --silent }
    Step 'test' @('quick', 'full') { npm test --silent }
    Step 'worker typecheck + test' @('quick', 'full') { npm run test:worker --silent }
    Step 'build' @('full') { npm run build --silent }
    Step 'e2e' @('full') { npm run e2e --silent }
} finally { Pop-Location }
if ($failed.Count) { Write-Host "check ($Tier): FAILED -> $($failed -join ', ')" -ForegroundColor Red; exit 1 }
Write-Host "check ($Tier): OK" -ForegroundColor Green
