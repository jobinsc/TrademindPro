@echo off
REM Double-click this file OR run: npm run dev:window
REM Opens a dedicated console so the server survives Cursor agent sessions.
set "ROOT=%~dp0.."
start "TradeMind Pro Dev" /D "%ROOT%" cmd.exe /k "title TradeMind Pro Dev && npm run dev"
exit /b 0
