@echo off
setlocal ENABLEDELAYEDEXPANSION

set SERVER_DIR=server
set WEB_DIR=web
set LOG_DIR=logs

if not exist "%SERVER_DIR%" (
  echo Server directory not found: %SERVER_DIR%
  exit /b 1
)
if not exist "%WEB_DIR%" (
  echo Web directory not found: %WEB_DIR%
  exit /b 1
)

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

set SERVER_LOG=%LOG_DIR%\server-dev.log
set WEB_LOG=%LOG_DIR%\web-dev.log

if exist "%SERVER_LOG%" del /f /q "%SERVER_LOG%"
if exist "%WEB_LOG%" del /f /q "%WEB_LOG%"

echo Starting server dev (logs: %SERVER_LOG%)
start "server-dev" cmd /c "cd /d %SERVER_DIR% && npm run dev 1>>"%CD%\%SERVER_LOG%" 2>>&1"

echo Starting web dev (logs: %WEB_LOG%)
start "web-dev" cmd /c "cd /d %WEB_DIR% && npm run dev 1>>"%CD%\%WEB_LOG%" 2>>&1"

echo Both processes started. Logs in %LOG_DIR%
echo Use "taskkill /FI "WINDOWTITLE eq server-dev"" or the PID in Task Manager to stop.

endlocal
exit /b 0

