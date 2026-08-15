Write-Host "=== 1. OS & ARCHITECTURE ==="
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, OSArchitecture, Version, BuildNumber | Format-List

Write-Host "=== 2. ADMIN PRIVILEGES ==="
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
$isAdmin = $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host "Is Administrator: $isAdmin"

Write-Host "=== 3. NODE & NPM ==="
try { node -v } catch { Write-Host "node not found" }
try { npm -v } catch { Write-Host "npm not found" }

Write-Host "=== 4. RUST & CARGO ==="
$cargoBin = "$env:USERPROFILE\.cargo\bin"
if (Test-Path $cargoBin) {
    $env:PATH += ";$cargoBin"
    & "$cargoBin\rustc.exe" -V
    & "$cargoBin\cargo.exe" -V
    & "$cargoBin\rustup.exe" toolchain list
    & "$cargoBin\rustup.exe" target list --installed
} else {
    Write-Host "Cargo bin directory not found at $cargoBin"
}

Write-Host "=== 5. VISUAL STUDIO & MSVC BUILD TOOLS SEARCH ==="
$vsPaths = @("C:\Program Files", "C:\Program Files (x86)", "C:\BuildTools")
Get-ChildItem -Path $vsPaths -Recurse -Include "vcvarsall.bat", "cl.exe", "link.exe" -ErrorAction SilentlyContinue | Select-Object FullName

Write-Host "=== 6. MINGW / GCC / DLLTOOL SEARCH ==="
Get-Command gcc, g++, dlltool, make -ErrorAction SilentlyContinue | Select-Object Name, Path
Get-ChildItem -Path "C:\", "C:\msys64", "C:\MinGW", "C:\Program Files", "C:\Program Files (x86)" -Recurse -Include "gcc.exe", "dlltool.exe" -ErrorAction SilentlyContinue | Select-Object FullName

Write-Host "=== 7. NPCAP DRIVER & SERVICE ==="
$sysExists = Test-Path "C:\Windows\System32\drivers\npcap.sys"
$wpcapExists = Test-Path "C:\Windows\System32\Npcap\wpcap.dll"
$packetExists = Test-Path "C:\Windows\System32\Npcap\Packet.dll"
Write-Host "npcap.sys exists: $sysExists"
Write-Host "wpcap.dll exists: $wpcapExists"
Write-Host "Packet.dll exists: $packetExists"
Get-Service npcap -ErrorAction SilentlyContinue | Select-Object Name, Status, StartType
