$tempDir = "C:\Users\1vi\AppData\Local\Temp\llvm-extract\llvm-mingw-20240619-ucrt-x86_64"
Write-Host "Temp extract dir exists: $(Test-Path $tempDir)"
Get-ChildItem $tempDir | Select-Object Name, FullName

$libSearch = Get-ChildItem -Path $tempDir -Recurse -Include "libkernel32.a", "libmsvcrt.a", "libgcc.a" -ErrorAction SilentlyContinue
if ($libSearch) {
    $libSearch | Select-Object FullName
}
