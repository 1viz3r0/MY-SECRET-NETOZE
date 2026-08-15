$llvmRoot = "C:\Users\1vi\.cargo\llvm-mingw"
Write-Host "Searching for lib directories in $llvmRoot..."
Get-ChildItem -Path $llvmRoot -Recurse -Include "libkernel32.a", "libmsvcrt.a", "libgcc.a" -ErrorAction SilentlyContinue | Select-Object FullName
