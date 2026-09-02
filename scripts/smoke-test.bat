@echo off
setlocal

if not defined SMOKE_API_URL set "SMOKE_API_URL=http://localhost:5001/api"

echo Running Course Management API smoke test...
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0smoke-test.ps1"

set "smoke_exit=%ERRORLEVEL%"
endlocal & exit /b %smoke_exit%
