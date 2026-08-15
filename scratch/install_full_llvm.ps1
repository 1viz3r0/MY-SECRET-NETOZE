$sourceDir = "C:\Users\1vi\AppData\Local\Temp\llvm-extract\llvm-mingw-20240619-ucrt-x86_64"
$targetDir = "C:\Users\1vi\.cargo\llvm-toolchain"

Write-Host "Copying full toolchain from $sourceDir to $targetDir..."
if (Test-Path $targetDir) {
    Remove-Item $targetDir -Recurse -Force
}

Copy-Item -Path $sourceDir -Destination $targetDir -Recurse -Force
Write-Host "Complete toolchain installed to $targetDir"
Write-Host "Verifying bin directory..."
Get-ChildItem "$targetDir\bin" | Select-Object -First 5 Name
Write-Host "Verifying x86_64-w64-mingw32 lib directory..."
Get-ChildItem "$targetDir\x86_64-w64-mingw32\lib" | Select-Object -First 5 Name
