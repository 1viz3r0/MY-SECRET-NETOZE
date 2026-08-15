$llvmBin = "C:\Users\1vi\.cargo\llvm-mingw"
$env:PATH = "$llvmBin;$env:USERPROFILE\.cargo\bin;$env:PATH"

Write-Host "=== TESTING INSTALLED LLVM-MINGW TOOLCHAIN ==="
Write-Host "Path: $llvmBin"
& "$llvmBin\dlltool.exe" --version
& "$llvmBin\x86_64-w64-mingw32-gcc.exe" --version
