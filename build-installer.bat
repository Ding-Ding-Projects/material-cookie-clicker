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
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\build-installer.ps1" %SILENT_ARG% %VERSION_ARG%
exit /b %ERRORLEVEL%
