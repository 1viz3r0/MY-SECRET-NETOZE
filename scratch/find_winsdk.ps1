Write-Host "Searching for kernel32.lib and msvcrt.lib..."
$sdkPaths = @("C:\Program Files (x86)\Windows Kits", "C:\Program Files\Windows Kits", "C:\Windows\System32", "C:\Windows")
foreach ($p in $sdkPaths) {
    if (Test-Path $p) {
        Write-Host "Scanning $p..."
        Get-ChildItem $p -Recurse -Include "kernel32.lib", "msvcrt.lib" -ErrorAction SilentlyContinue | Select-Object FullName
    }
}
