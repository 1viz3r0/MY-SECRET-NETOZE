@echo off
cd C:\Users\1vi\Music\netoze-dashboard
echo Checking Tauri EXE...
tasklist | findstr netoze-desktop
if %errorlevel% equ 0 (
    echo EXE is running
) else (
    echo EXE is NOT running
)
echo.
echo Checking Tauri info...
npx taure info 2>&1 | find "CSP" >NUL
if %errorlevel% equ 0 (
    echo CSP info available
) else (
    echo No CSP info
)