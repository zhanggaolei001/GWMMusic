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
$serverCmd = "chcp 65001 >nul & cd /d `"$serverAbs`" & npm run dev 1>>`"$serverLogAbs`" 2>>&1"
$serverProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $serverCmd -PassThru

Write-Host "Starting web dev (logs: $webLog)" -ForegroundColor Green
$webAbs = (Resolve-Path $WebDir).Path
$webLogAbs = (Resolve-Path $LogDir).Path + [IO.Path]::DirectorySeparatorChar + (Split-Path -Leaf $webLog)
$webCmd = "chcp 65001 >nul & cd /d `"$webAbs`" & npm run dev 1>>`"$webLogAbs`" 2>>&1"
$webProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $webCmd -PassThru

Write-Host "Both processes started." -ForegroundColor Cyan
Write-Host ("Server PID: {0} | Web PID: {1}" -f ($serverProc.Id | ForEach-Object {$_}), ($webProc.Id | ForEach-Object {$_}))
Write-Host "Tail logs with: `n  Get-Content $serverLog -Wait`n  Get-Content $webLog -Wait" -ForegroundColor DarkGray
Write-Host "Press Ctrl+C to end this script. Use Stop-Process -Id <PID> to stop individually."

# Block until either process exits (simplest way to avoid immediate return)
if ($serverProc -and $webProc) {
  Wait-Process -Id $serverProc.Id, $webProc.Id
} elseif ($serverProc) {
  Wait-Process -Id $serverProc.Id
} elseif ($webProc) {
  Wait-Process -Id $webProc.Id
} else {
  Write-Warning "Failed to start server/web processes. Check logs directory."
}
