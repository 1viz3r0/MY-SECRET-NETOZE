$cargoBin = "$env:USERPROFILE\.cargo\bin"
Write-Host "Searching for rust-lld.exe in rustup toolchains..."
Get-ChildItem "$env:USERPROFILE\.rustup" -Recurse -Include "rust-lld.exe", "lld-link.exe", "link.exe" -ErrorAction SilentlyContinue | Select-Object FullName

Write-Host "Searching for Visual Studio / MSVC / Windows SDK..."
$paths = @("C:\Program Files", "C:\Program Files (x86)", "C:\BuildTools", "C:\VS2022", "C:\VS2019")
foreach ($p in $paths) {
    if (Test-Path $p) {
        Write-Host "Scanning $p..."
        Get-ChildItem $p -Recurse -Include "vcvarsall.bat", "VsDevCmd.bat", "cl.exe", "link.exe" -ErrorAction SilentlyContinue | Select-Object FullName
    }
}
