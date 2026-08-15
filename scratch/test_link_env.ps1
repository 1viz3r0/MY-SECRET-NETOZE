$llvmRoot = "C:\Users\1vi\.cargo\llvm-toolchain"
$binDir = "$llvmRoot\bin"
$libDir1 = "$llvmRoot\x86_64-w64-mingw32\lib"
$libDir2 = "$llvmRoot\lib\clang\18\lib\windows"

$env:PATH = "$binDir;$env:USERPROFILE\.cargo\bin;$env:PATH"
$env:LIBRARY_PATH = "$libDir1;$libDir2"
$env:LIB = "$libDir1;$libDir2"

Write-Host "PATH: $env:PATH"
Write-Host "LIBRARY_PATH: $env:LIBRARY_PATH"

Set-Location "C:\Users\1vi\.gemini\antigravity\scratch\netoze-dashboard\src-tauri"
& "$env:USERPROFILE\.cargo\bin\rustup.exe" default stable-x86_64-pc-windows-gnu
cargo check
