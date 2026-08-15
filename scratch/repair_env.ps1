Write-Host "=== WINGET INSTALLING VISUAL STUDIO BUILD TOOLS ==="
$wingetCmd = "winget install --id Microsoft.VisualStudio.2022.BuildTools --override `"--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.22621`" --accept-source-agreements --accept-package-agreements"
Write-Host "Executing: $wingetCmd"
Invoke-Expression $wingetCmd
