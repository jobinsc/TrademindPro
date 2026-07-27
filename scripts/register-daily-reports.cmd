@echo off
REM One-click register: TradeMind Pro daily ATM Lab + PinaxForge PDF reports
REM Runs weekdays at 15:20 India Standard Time via Windows Task Scheduler.
REM Safe to re-run (overwrites the same scheduled task).

setlocal
set TASK_NAME=TradeMindPro-DailySessionReports
pushd "%~dp0.."
set ROOT=%CD%
popd
set NODE_EXE=
where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: node.exe not found on PATH. Install Node.js or open a terminal where node works.
  exit /b 1
)

for /f "delims=" %%i in ('where node') do (
  set NODE_EXE=%%i
  goto :have_node
)
:have_node

set SCRIPT=%ROOT%\scripts\daily-session-reports.mjs
if not exist "%SCRIPT%" (
  echo ERROR: Missing %SCRIPT%
  exit /b 1
)

echo Registering scheduled task "%TASK_NAME%" ...
echo   Trigger: Mon-Fri 15:20 India Standard Time
echo   Action:  node "%SCRIPT%"
echo.

REM /SC WEEKLY /D MON,TUE,WED,THU,FRI at 15:20
REM Use schtasks; India Standard Time is Windows timezone id for IST.
schtasks /Create /F /TN "%TASK_NAME%" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 15:20 /RL LIMITED /TR "\"%NODE_EXE%\" \"%SCRIPT%\"" /RU "%USERNAME%"

if errorlevel 1 (
  echo.
  echo Failed to create task. Try running this .cmd from an elevated Command Prompt,
  echo or create the task manually in Task Scheduler pointing at:
  echo   %NODE_EXE% "%SCRIPT%"
  exit /b 1
)

echo.
echo OK. Task registered.
echo   View: Task Scheduler -^> Task Scheduler Library -^> %TASK_NAME%
echo   Test now: schtasks /Run /TN "%TASK_NAME%"
echo   Or:      npm run reports:daily -- --force
echo.
echo Note: The script itself also refuses to generate before 15:15 IST unless --force.
endlocal
