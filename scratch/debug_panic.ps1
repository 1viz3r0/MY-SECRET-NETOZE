$exePath = "C:\Users\1vi\.gemini\antigravity\scratch\netoze-dashboard\src-tauri\target\release\netoze-desktop.exe"
$llvmBin = "C:\Users\1vi\.cargo\llvm-toolchain\bin"
$npcapDir = "C:\Windows\System32\Npcap"

$env:PATH = "$llvmBin;$npcapDir;$env:PATH"
$env:RUST_BACKTRACE = "1"

Write-Host "Running executable with RUST_BACKTRACE=1..."
& $exePath 2>&1 | Select-Object -First 30
