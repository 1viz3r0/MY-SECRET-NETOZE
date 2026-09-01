@echo off
cd C:\Users\1vi\Music\netoze-dashboard
npx vite --host 127.0.0.1 > vite.log 2>&1
echo Vite exited with error level %errorlevel%