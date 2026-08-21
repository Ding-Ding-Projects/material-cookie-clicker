@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "SILENT_ARG="
if /I "%SILENT%"=="1" set "SILENT_ARG=-Silent"
for %%A in (%*) do (
  if /I "%%~A"=="/s" set "SILENT_ARG=-Silent"
  if /I "%%~A"=="--silent" set "SILENT_ARG=-Silent"
)

REM ---------------------------------------------------------------------------
REM Pre-elevate, up front, so a run can never fail halfway for lack of rights.
REM
REM Asked for directly by the owner. It is deliberately INTERACTIVE-ONLY: a silent
REM run is what CI, a scheduled task and another agent use, and blocking one of
REM those on a UAC prompt nobody can answer turns a build into a hang. Everything
REM this script installs resolves to a user-scoped path anyway, so an unelevated
REM silent run is still correct — it just says so rather than pretending.
REM
REM No sentinel variable is needed to stop a loop: the relaunched copy IS elevated,
REM so its own `net session` check succeeds and it falls straight through. If the
REM user declines the prompt, Start-Process throws and this exits non-zero.
REM ---------------------------------------------------------------------------
net session >nul 2>&1
if %ERRORLEVEL%==0 goto :elevated
if defined SILENT_ARG (
  echo [build] Not elevated and running silently - continuing with user-scoped paths.
  goto :elevated
)
echo [build] Requesting administrator rights before starting...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$a='%*'; $s=@{FilePath='%~f0'; Verb='RunAs'; WorkingDirectory='%SCRIPT_DIR%'; PassThru=$true; Wait=$true}; if(-not [string]::IsNullOrWhiteSpace($a)){$s['ArgumentList']=$a}; try{$p=Start-Process @s; exit $p.ExitCode}catch{Write-Error $_; exit 1}"
exit /b %ERRORLEVEL%
:elevated

REM One click means one click: fetch every dependency first, then build. Nobody
REM should have to know that download-dependencies.bat exists.
call "%SCRIPT_DIR%download-dependencies.bat" %*
if not "%ERRORLEVEL%"=="0" exit /b %ERRORLEVEL%
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\build-local.ps1" %SILENT_ARG%
exit /b %ERRORLEVEL%
