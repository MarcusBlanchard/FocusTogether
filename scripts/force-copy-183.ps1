$ErrorActionPreference = "Stop"
$src = "C:\Users\amhou\Flowlocked\FocusTogether\src-tauri\target\release\Flowlocked.exe"
$dst = "C:\Program Files\Flowlocked\Flowlocked.exe"
if (-not (Test-Path $src)) { throw "Missing $src" }
Get-Process Flowlocked -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Copy-Item -Path $src -Destination $dst -Force
Write-Output "OK copied -> $dst"
Get-Item $dst | Select-Object FullName, LastWriteTime, Length | Format-Table -AutoSize
Start-Process $dst
