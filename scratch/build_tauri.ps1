$llvmRoot = "C:\Users\1vi\.cargo\llvm-toolchain"
$binDir = "$llvmRoot\bin"
$npcapDir = "C:\Windows\System32\Npcap"
$libDir1 = "$llvmRoot\x86_64-w64-mingw32\lib"
$libDir2 = "$llvmRoot\lib\clang\18\lib\windows"

$env:PATH = "$binDir;$npcapDir;$env:USERPROFILE\.cargo\bin;$env:PATH"
$env:LIBRARY_PATH = "$libDir1;$libDir2"
$env:LIB = "$libDir1;$libDir2"

Write-Host "=== BUILDING TAURI PRODUCTION DESKTOP APP ==="
Set-Location "C:\Users\1vi\.gemini\antigravity\scratch\netoze-dashboard"
& "$env:USERPROFILE\.cargo\bin\rustup.exe" default stable-x86_64-pc-windows-gnu

npx -y @tauri-apps/cli@latest build
