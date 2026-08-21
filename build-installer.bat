@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "SILENT_ARG="
set "VERSION_ARG="
if /I "%SILENT%"=="1" set "SILENT_ARG=-Silent"
if defined EFFECTIVE_RELEASE_VERSION set "VERSION_ARG=-EffectiveVersion %EFFECTIVE_RELEASE_VERSION%"

:parse_args
if "%~1"=="" goto run_installer
if /I "%~1"=="/s" (
  set "SILENT_ARG=-Silent"
  shift
  goto parse_args
)
if /I "%~1"=="--silent" (
  set "SILENT_ARG=-Silent"
  shift
  goto parse_args
)
if /I "%~1"=="/version" goto take_version
if /I "%~1"=="--version" goto take_version
echo Unknown build-installer.bat option: %~1 1>&2
exit /b 2

:take_version
if "%~2"=="" (
  echo %~1 requires a stable semantic version. 1>&2
  exit /b 2
)
set "VERSION_ARG=-EffectiveVersion %~2"
shift
shift
goto parse_args

:run_installer
REM ---------------------------------------------------------------------------
REM Pre-elevate, up front, so a run can never fail halfway for lack of rights.
REM
REM Interactive only, for the same reason as build.bat: a silent run is what CI, a
REM scheduled task and another agent use, and blocking one of those on a UAC prompt
REM nobody can answer turns a build into a hang. Everything installed here resolves
REM to a user-scoped path, so an unelevated silent run is still correct.
REM
REM The relaunched copy IS elevated, so its own `net session` check succeeds and it
REM falls through - no sentinel is needed to stop a loop. A declined prompt makes
REM Start-Process throw, and this exits non-zero rather than looping.
REM ---------------------------------------------------------------------------
net session >nul 2>&1
if %ERRORLEVEL%==0 goto :elevated
if defined SILENT_ARG (
  echo [build-installer] Not elevated and running silently - continuing with user-scoped paths.
  goto :elevated
)
echo [build-installer] Requesting administrator rights before starting...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$a='%*'; $s=@{FilePath='%~f0'; Verb='RunAs'; WorkingDirectory='%SCRIPT_DIR%'; PassThru=$true; Wait=$true}; if(-not [string]::IsNullOrWhiteSpace($a)){$s['ArgumentList']=$a}; try{$p=Start-Process @s; exit $p.ExitCode}catch{Write-Error $_; exit 1}"
exit /b %ERRORLEVEL%
:elevated

REM One click means one click. This script used to assume the dependency tree was
REM already there, so a fresh machine had to know download-dependencies.bat existed
REM and run it by hand first - exactly the manual step the owner asked to remove.
REM build.bat has always fetched; this one now does too.
call "%SCRIPT_DIR%download-dependencies.bat" %*
if not "%ERRORLEVEL%"=="0" exit /b %ERRORLEVEL%
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\build-installer.ps1" %SILENT_ARG% %VERSION_ARG%
exit /b %ERRORLEVEL%
