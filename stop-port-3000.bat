@echo off
echo Stopping all processes on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do (
echo Killing PID %%a
taskkill /F /PID %%a
)
echo Done.
pause