$exePath = "C:\Users\1vi\.gemini\antigravity\scratch\netoze-dashboard\src-tauri\target\release\netoze-desktop.exe"
$llvmBin = "C:\Users\1vi\.cargo\llvm-toolchain\bin"
$npcapDir = "C:\Windows\System32\Npcap"

$env:PATH = "$llvmBin;$npcapDir;$env:PATH"

if (Test-Path $exePath) {
    Write-Host "FOUND RELEASE EXECUTABLE: $exePath"
    $item = Get-Item $exePath
    Write-Host ("Size: {0:N2} MB" -f ($item.Length / 1MB))
    
    # Start process briefly to verify non-zero launch initialization
    $proc = Start-Process -FilePath $exePath -PassThru
    Start-Sleep -Seconds 3
    if ($proc -and -not $proc.HasExited) {
        Write-Host "PROCESS LAUNCH SUCCESS! PID: $($proc.Id)"
        Stop-Process -Id $proc.Id -Force
        Write-Host "PROCESS VERIFIED AND CLEANLY TERMINATED."
    } else {
        Write-Host "PROCESS EXITED IMMEDIATELY WITH CODE: $($proc.ExitCode)"
    }
} else {
    Write-Host "EXECUTABLE NOT FOUND AT $exePath"
}
