Param(
  [string]$ServerDir = "server",
  [string]$WebDir = "web",
  [string]$LogDir = "logs"
)

if (-not (Test-Path $ServerDir)) { throw "Server directory not found: $ServerDir" }
if (-not (Test-Path $WebDir)) { throw "Web directory not found: $WebDir" }

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$serverLog = Join-Path $LogDir "server-dev.log"
$webLog    = Join-Path $LogDir "web-dev.log"

# Rotate old logs
if (Test-Path $serverLog) { Remove-Item $serverLog -Force }
if (Test-Path $webLog)    { Remove-Item $webLog -Force }

Write-Host "Starting server dev (logs: $serverLog)" -ForegroundColor Green
$serverAbs = (Resolve-Path $ServerDir).Path
$serverLogAbs = (Resolve-Path $LogDir).Path + [IO.Path]::DirectorySeparatorChar + (Split-Path -Leaf $serverLog)
$serverCmd = "cd /d `"$serverAbs`" && npm run dev 1>>`"$serverLogAbs`" 2>>&1"
$serverProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $serverCmd -PassThru

Write-Host "Starting web dev (logs: $webLog)" -ForegroundColor Green
$webAbs = (Resolve-Path $WebDir).Path
$webLogAbs = (Resolve-Path $LogDir).Path + [IO.Path]::DirectorySeparatorChar + (Split-Path -Leaf $webLog)
$webCmd = "cd /d `"$webAbs`" && npm run dev 1>>`"$webLogAbs`" 2>>&1"
$webProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $webCmd -PassThru

Write-Host "Both processes started." -ForegroundColor Cyan
Write-Host ("Server PID: {0} | Web PID: {1}" -f ($serverProc.Id | ForEach-Object {$_}), ($webProc.Id | ForEach-Object {$_}))
Write-Host "Tail logs with: `n  Get-Content $serverLog -Wait`n  Get-Content $webLog -Wait" -ForegroundColor DarkGray
Write-Host "Press Ctrl+C to end this script. Use Stop-Process -Id <PID> to stop individually."

# Keep the script alive to allow Ctrl+C and quick status
try {
  while ($true) {
    Start-Sleep -Seconds 1
    if ($serverProc.HasExited -or $webProc.HasExited) { break }
  }
} finally {
  # No auto-kill; user may want to keep them running after script exits
}
