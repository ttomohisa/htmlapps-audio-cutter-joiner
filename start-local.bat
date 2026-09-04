@echo off
setlocal
cd /d "%~dp0"
if exist dist\index.html (
  start "" "%~dp0dist\index.html"
) else (
  echo dist\index.html was not found. Building first...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-standalone.ps1"
  if errorlevel 1 exit /b 1
  start "" "%~dp0dist\index.html"
)
