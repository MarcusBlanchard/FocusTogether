# Build zirain-app-icon.png from the committed master logo (transparent background).
param(
    [string]$Source = "",
    [string]$Out = "",
    [int]$Threshold = 48
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = (Join-Path $PSScriptRoot ".." | Resolve-Path).Path
$srcDir = Join-Path $root "src-tauri"

if (-not $Source) {
    $candidates = @(
        (Join-Path $srcDir "zirain-logo-source.png"),
        (Join-Path $srcDir "zirain-logo-source.jpg"),
        (Join-Path $srcDir "zirain-logo-source.jpeg")
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) {
            $Source = $c
            break
        }
    }
    if (-not $Source) {
        Write-Error "prepare-zirain-icon: missing master logo. Add src-tauri/zirain-logo-source.png (or .jpg)."
    }
}

if (-not $Out) {
    $Out = Join-Path $srcDir "zirain-app-icon.png"
}

$img = [System.Drawing.Image]::FromFile((Resolve-Path $Source))
$bmp = New-Object System.Drawing.Bitmap $img.Width, $img.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
$g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
$g.DrawImage($img, 0, 0, $img.Width, $img.Height)
$g.Dispose()
$img.Dispose()

$rect = New-Object System.Drawing.Rectangle 0, 0, $bmp.Width, $bmp.Height
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, $bmp.PixelFormat)
$bytes = New-Object byte[] ($data.Stride * $data.Height)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)

for ($y = 0; $y -lt $data.Height; $y++) {
    for ($x = 0; $x -lt $data.Width; $x++) {
        $i = $y * $data.Stride + $x * 4
        $b = $bytes[$i]
        $gch = $bytes[$i + 1]
        $r = $bytes[$i + 2]
        if ($r -le $Threshold -and $gch -le $Threshold -and $b -le $Threshold) {
            $bytes[$i] = 0
            $bytes[$i + 1] = 0
            $bytes[$i + 2] = 0
            $bytes[$i + 3] = 0
        }
    }
}

[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length)
$bmp.UnlockBits($data)

$dir = Split-Path $Out -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)

function Write-ResizedPng([System.Drawing.Bitmap]$source, [string]$path, [int]$size) {
    $out = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($out)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
    $g.DrawImage($source, 0, 0, $size, $size)
    $g.Dispose()
    $parent = Split-Path $path -Parent
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    $out.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $out.Dispose()
}

$publicDir = Join-Path $root "client\public"
Write-ResizedPng $bmp (Join-Path $publicDir "zirain-logo.png") 128
Write-ResizedPng $bmp (Join-Path $publicDir "favicon.png") 32
$bmp.Dispose()

$legacyLogo = Join-Path $publicDir "flowlocked-logo.png"
if (Test-Path $legacyLogo) { Remove-Item $legacyLogo -Force }

Write-Host "prepare-zirain-icon: $($Source | Split-Path -Leaf) -> $Out (threshold=$Threshold)"
Write-Host "prepare-zirain-icon: synced client/public/zirain-logo.png and favicon.png"
