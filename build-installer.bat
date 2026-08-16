@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "SILENT_ARG="
if /I "%SILENT%"=="1" set "SILENT_ARG=-Silent"
for %%A in (%*) do (
  if /I "%%~A"=="/s" set "SILENT_ARG=-Silent"
  if /I "%%~A"=="--silent" set "SILENT_ARG=-Silent"
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\build-installer.ps1" %SILENT_ARG%
exit /b %ERRORLEVEL%
