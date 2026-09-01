@echo off
cd C:\Users\1vi\Music\netoze-dashboard
echo Starting Vite dev server...
npx vite --host 127.0.0.1 > vite.log 2>&1
echo Vite exited with error level %errorlevel%