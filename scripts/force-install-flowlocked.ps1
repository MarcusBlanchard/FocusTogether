$ErrorActionPreference = "Stop"

$src = "C:\Users\amhou\Flowlocked\FocusTogether\src-tauri\target\release\Flowlocked.exe"
$dstDir = "C:\Program Files\Flowlocked"
$dst = Join-Path $dstDir "Flowlocked.exe"

if (-not (Test-Path $src)) {
  throw "Built executable not found: $src"
}

Get-Process Flowlocked -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

if (-not (Test-Path $dstDir)) {
  New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
}

Copy-Item -Path $src -Destination $dst -Force

Write-Output "Copied $src -> $dst"
Get-Item $dst | Select-Object FullName, LastWriteTime, Length | Format-Table -AutoSize
