$targetLibDir = "C:\Users\1vi\.cargo\llvm-toolchain\x86_64-w64-mingw32\lib"

Write-Host "Checking target lib directory: $targetLibDir"
if (Test-Path "$targetLibDir\libunwind.a") {
    Write-Host "Found libunwind.a, creating compatibility copies for libgcc.a and libgcc_eh.a..."
    Copy-Item -Path "$targetLibDir\libunwind.a" -Destination "$targetLibDir\libgcc.a" -Force
    Copy-Item -Path "$targetLibDir\libunwind.a" -Destination "$targetLibDir\libgcc_eh.a" -Force
    Write-Host "Compatibility libraries created successfully!"
} else {
    Write-Host "libunwind.a not found in $targetLibDir"
}
