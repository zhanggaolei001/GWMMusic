Param(
  [ValidateSet('unit','netease','bili','all','clean')]
  [string]$Suite = 'unit',
  [string]$BaseUrl,
  [string]$Cookie,
  [switch]$NoRetentionTweaks
)

<#
.SYNOPSIS
  Run unit or E2E tests for the server with helpful defaults.

.PARAMETER Suite
  unit      - Run unit tests only (fast, no network)
  netease   - Run NetEase E2E (generates cache under cache/test)
  bili      - Run Bilibili E2E (generates cache under cache/test)
  all       - Run unit then both E2E suites sequentially
  clean     - Remove cache/test artifacts only

.PARAMETER BaseUrl
  If provided, E2E will hit this server (e.g. http://localhost:4000) instead of spawning a dev server.

.PARAMETER Cookie
  NETEASE_COOKIE value for NetEase E2E.

.PARAMETER NoRetentionTweaks
  Do not override cache retention envs (by default E2E set CACHE_MIN_SIZE_MB=0, CACHE_MIN_BITRATE_KBPS=0, CACHE_TTL_HOURS=0).

.EXAMPLE
  ./run-tests.ps1 -Suite unit

.EXAMPLE
  ./run-tests.ps1 -Suite netease -Cookie "MUSIC_U=...; __csrf=..." -BaseUrl "http://localhost:4000"

.EXAMPLE
  ./run-tests.ps1 -Suite all
#>

$ErrorActionPreference = 'Stop'

function Set-RetentionEnv {
  param([switch]$Enable)
  if ($Enable) {
    $env:CACHE_MIN_SIZE_MB = '0'
    $env:CACHE_MIN_BITRATE_KBPS = '0'
    $env:CACHE_TTL_HOURS = '0'
  }
}

function Clear-RetentionEnv {
  Remove-Item Env:CACHE_MIN_SIZE_MB -ErrorAction SilentlyContinue
  Remove-Item Env:CACHE_MIN_BITRATE_KBPS -ErrorAction SilentlyContinue
  Remove-Item Env:CACHE_TTL_HOURS -ErrorAction SilentlyContinue
}

function Run-Unit {
  Write-Host "[run-tests] Running unit tests..." -ForegroundColor Cyan
  Push-Location server
  try {
    npm test
  } finally {
    Pop-Location
  }
}

function Run-E2E-Netease {
  Write-Host "[run-tests] Running NetEase E2E..." -ForegroundColor Cyan
  if ($BaseUrl) { $env:BASE_URL = $BaseUrl }
  if ($Cookie) { $env:NETEASE_COOKIE = $Cookie }
  if (-not $NoRetentionTweaks) { Set-RetentionEnv -Enable }
  Push-Location server
  try {
    npm run test:e2e:netease
  } finally {
    Pop-Location
    if ($BaseUrl) { Remove-Item Env:BASE_URL -ErrorAction SilentlyContinue }
    if ($Cookie) { Remove-Item Env:NETEASE_COOKIE -ErrorAction SilentlyContinue }
    if (-not $NoRetentionTweaks) { Clear-RetentionEnv }
  }
}

function Run-E2E-Bili {
  Write-Host "[run-tests] Running Bilibili E2E..." -ForegroundColor Cyan
  if ($BaseUrl) { $env:BASE_URL = $BaseUrl }
  if (-not $NoRetentionTweaks) { Set-RetentionEnv -Enable }
  Push-Location server
  try {
    npm run test:e2e:bili
  } finally {
    Pop-Location
    if ($BaseUrl) { Remove-Item Env:BASE_URL -ErrorAction SilentlyContinue }
    if (-not $NoRetentionTweaks) { Clear-RetentionEnv }
  }
}

function Run-Clean {
  Write-Host "[run-tests] Cleaning cache/test..." -ForegroundColor Yellow
  Push-Location server
  try {
    npm run test:clean
  } finally {
    Pop-Location
  }
}

switch ($Suite) {
  'unit'    { Run-Unit }
  'netease' { Run-E2E-Netease }
  'bili'    { Run-E2E-Bili }
  'all'     { Run-Unit; Run-E2E-Netease; Run-E2E-Bili }
  'clean'   { Run-Clean }
  default   { throw "Unknown suite: $Suite" }
}

Write-Host "[run-tests] Done." -ForegroundColor Green

