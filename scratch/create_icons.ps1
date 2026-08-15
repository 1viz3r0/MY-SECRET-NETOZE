$iconsDir = "C:\Users\1vi\.gemini\antigravity\scratch\netoze-dashboard\src-tauri\icons"
if (-not (Test-Path $iconsDir)) {
    New-Item -ItemType Directory -Path $iconsDir -Force | Out-Null
}

Write-Host "Creating default placeholder icons in $iconsDir..."

# Generate a clean 32x32 / 128x128 PNG and ICO using basic byte structure or system icon generator
$icoPath = "$iconsDir\icon.ico"
$pngPath = "$iconsDir\icon.png"
$32Path = "$iconsDir\32x32.png"
$128Path = "$iconsDir\128x128.png"

# Minimal valid ICO header + PNG payload for 32x32 blue shield
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(128, 128)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(255, 5, 11, 24))

$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 34, 211, 238), 6)
$g.DrawRectangle($pen, 16, 16, 96, 96)

$font = New-Object System.Drawing.Font("Arial", 16, [System.Drawing.FontStyle]::Bold)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 34, 211, 238))
$g.DrawString("N0ZE", $font, $brush, 28, 48)

$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save($128Path, [System.Drawing.Imaging.ImageFormat]::Png)

$bmp32 = New-Object System.Drawing.Bitmap($bmp, 32, 32)
$bmp32.Save($32Path, [System.Drawing.Imaging.ImageFormat]::Png)

# Convert Bitmap to ICO
$iconHandle = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($iconHandle)
$fileStream = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
$icon.Save($fileStream)
$fileStream.Close()

Write-Host "Icons generated successfully at $iconsDir"
