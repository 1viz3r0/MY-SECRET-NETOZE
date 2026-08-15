$selfContained = "C:\Users\1vi\.rustup\toolchains\stable-x86_64-pc-windows-gnu\lib\rustlib\x86_64-pc-windows-gnu\bin\self-contained"
Write-Host "Self contained path exists: $(Test-Path $selfContained)"
Get-ChildItem $selfContained | Select-Object Name, FullName
