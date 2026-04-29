Stop-Process -Name Flowlocked -Force -ErrorAction SilentlyContinue
Copy-Item 'c:\Users\amhou\Flowlocked\FocusTogether\src-tauri\target\release\Flowlocked.exe' 'C:\Program Files\Flowlocked\Flowlocked.exe' -Force
Start-Process 'C:\Program Files\Flowlocked\Flowlocked.exe'
