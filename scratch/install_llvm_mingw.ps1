Write-Host "=== DOWNLOADING PORTABLE LLVM-MINGW COMPILER TOOLCHAIN ==="
$targetDir = "$env:USERPROFILE\.cargo\llvm-mingw"
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

$zipUrl = "https://github.com/mstorsjo/llvm-mingw/releases/download/20240619/llvm-mingw-20240619-ucrt-x86_64.zip"
$zipFile = "$env:TEMP\llvm-mingw.zip"

Write-Host "Downloading $zipUrl..."
try {
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing
    Write-Host "Download complete. Extracting zip..."
    Expand-Archive -Path $zipFile -DestinationPath $env:TEMP\llvm-extract -Force
    
    $extractedBin = Get-ChildItem "$env:TEMP\llvm-extract" -Recurse -Filter "dlltool.exe" | Select-Object -First 1
    if ($extractedBin) {
        $binDir = $extractedBin.Directory.FullName
        Write-Host "Found toolchain bin directory at: $binDir"
        Copy-Item -Path "$binDir\*" -Destination $targetDir -Recurse -Force
        Write-Host "Portable toolchain installed to $targetDir"
    } else {
        Write-Host "Could not find dlltool.exe in extracted archive."
    }
} catch {
    Write-Host "Download failed: $_"
}
