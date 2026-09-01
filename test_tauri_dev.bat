@echo off
cd C:\Users\1vi\Music\netoze-dashboard
echo Starting Tauri dev mode...
npx tauri dev --no-dev-server 2>&1
echo Tauri dev exited with error level %errorlevel%