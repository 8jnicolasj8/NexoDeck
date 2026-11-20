$ErrorActionPreference = "Stop"

# VexaDeck v1.0.0 regression checks:
#   1. Grid rules shared by the panel and GridService (Node self-check).
#   2. Action schema registry completeness.
#   3. v0.1 -> v0.3 config migration without losing any button.
#   4. App catalog and icon extraction (IShellItemImageFactory) served by hash.
#   5. Spotify/Gamer edits (positions and deleted buttons) survive a save.

$repoRoot = (Get-Item $PSScriptRoot).FullName
$exePath = Join-Path $repoRoot "server\src\VexaDeck.Server\bin\Release\net8.0-windows10.0.19041.0\win-x64\publish\VexaDeck.Server.exe"
if (-not (Test-Path $exePath)) { throw "Published exe not found. Run installer/build.ps1 first." }

$running = Get-Process -Name "VexaDeck.Server" -ErrorAction SilentlyContinue
if ($running) { throw "VexaDeck is already running. Close it before running this test." }

Write-Host "`n1. Grid rules self-check..."
node (Join-Path $repoRoot "tools\grid-rules-check.js")
if ($LASTEXITCODE -ne 0) { throw "Grid rules self-check failed." }

$dataDir = Join-Path $repoRoot ".verify-data-m9"
if (Test-Path $dataDir) { Remove-Item -Recurse -Force $dataDir }
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

# A v0.1 configuration: version 1, legacy action kinds, free-text parameters.
$legacy = @'
{
  "version": 1,
  "defaultProfileId": "global",
  "profiles": [
    {
      "id": "global",
      "name": "Global",
      "accent": "#00FF9C",
      "grid": { "cols": 4, "rows": 4 },
      "match": { "processes": [] },
      "pages": [
        {
          "id": "p1",
          "name": "Principal",
          "buttons": [
            { "id": "b1", "type": "action", "label": "Copiar", "pos": { "row": 0, "col": 0, "rowSpan": 1, "colSpan": 1 },
              "action": { "kind": "hotkey", "params": { "keys": "ctrl+c" } } },
            { "id": "b2", "type": "action", "label": "Musica", "pos": { "row": 0, "col": 1, "rowSpan": 1, "colSpan": 1 },
              "action": { "kind": "media", "params": { "target": "toggle" } } },
            { "id": "b3", "type": "toggle", "label": "Microfono", "pos": { "row": 0, "col": 2, "rowSpan": 1, "colSpan": 1 },
              "action": { "kind": "mic.mute", "params": {} } },
            { "id": "b4", "type": "action", "label": "Bloc", "pos": { "row": 1, "col": 0, "rowSpan": 1, "colSpan": 1 },
              "action": { "kind": "launch", "params": { "path": "C:\\Windows\\System32\\notepad.exe" } } },
            { "id": "b5", "type": "action", "label": "Raro", "pos": { "row": 1, "col": 1, "rowSpan": 1, "colSpan": 1 },
              "action": { "kind": "custom.thing", "params": { "foo": "bar" } } }
          ]
        }
      ]
    }
  ]
}
'@
Set-Content -Path (Join-Path $dataDir "config.json") -Value $legacy -Encoding UTF8

$proc = Start-Process -FilePath $exePath -ArgumentList "--background --dev --data-dir `"$dataDir`"" -PassThru
try {
    $deadline = (Get-Date).AddSeconds(45)
    $health = $null
    while ((Get-Date) -lt $deadline -and -not $health) {
        try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/health" -TimeoutSec 2 } catch { Start-Sleep -Milliseconds 400 }
    }
    if (-not $health) { throw "Server did not become healthy on port 47802." }
    Write-Host "  -> health OK, version $($health.version)"
    if ($health.version -ne "1.0.0") { throw "Expected version 1.0.0, got '$($health.version)'" }

    Write-Host "`n2. Action schema registry..."
    $schemas = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/action-schemas"
    $expected = @(
        "hotkey", "text.type", "media", "volume.master", "volume.app", "mute.toggle", "audio.device",
        "clipboard.copy", "clipboard.cut", "clipboard.paste", "clipboard.paste_plain", "clipboard.snippet",
        "launch", "script.run", "power", "folder.open", "profile.pin"
    )
    $kinds = $schemas.kinds | ForEach-Object { $_.kind }
    foreach ($kind in $expected) {
        if ($kinds -notcontains $kind) { throw "Action kind '$kind' is missing from the registry." }
    }
    Write-Host "  -> $($kinds.Count) kinds, all documented kinds present"

    Write-Host "`n3. v0.1 -> v0.3 config migration..."
    $cfg = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/config"
    if ($cfg.version -ne 3) { throw "Expected config version 3, got $($cfg.version)" }
    $buttons = $cfg.profiles[0].pages[0].buttons
    if ($buttons.Count -ne 5) { throw "Expected 5 migrated buttons, got $($buttons.Count)" }

    $mic = $buttons | Where-Object { $_.id -eq "b3" }
    if ($mic.action.kind -ne "mute.toggle") { throw "mic.mute was not remapped to mute.toggle." }
    if ($mic.action.params.target -ne "mic") { throw "Microphone intent lost: target is '$($mic.action.params.target)'." }
    if ($mic.stateBinding -ne "mic.muted") { throw "Expected stateBinding mic.muted, got '$($mic.stateBinding)'." }

    $launch = $buttons | Where-Object { $_.id -eq "b4" }
    if ($launch.action.params.path -notlike "*notepad.exe") { throw "launch path was not preserved." }
    if ($launch.icon.kind -ne "exe" -or $launch.icon.value -notlike "/icons/*.png") {
        throw "launch button did not resolve the real app icon (kind '$($launch.icon.kind)', value '$($launch.icon.value)')."
    }
    $launchPng = Invoke-WebRequest -Uri "http://127.0.0.1:47802$($launch.icon.value)" -UseBasicParsing
    if ($launchPng.StatusCode -ne 200) { throw "Migrated launch icon is not served." }

    $odd = $buttons | Where-Object { $_.id -eq "b5" }
    if ($odd.action.kind -ne "custom.thing" -or $odd.action.params.foo -ne "bar") { throw "Unknown legacy action was not preserved." }

    if (-not (Test-Path (Join-Path $dataDir "config.bak.json"))) { throw "config.bak.json was not created before migrating." }
    Write-Host "  -> 5/5 buttons preserved, mic binding derived, backup written"

    Write-Host "`n4. App catalog and icon extraction..."
    $apps = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/apps?source=installed" -TimeoutSec 90
    if ($apps.Count -lt 1) { throw "Installed app catalog is empty." }
    Write-Host "  -> $($apps.Count) installed apps (Start Menu + shell:AppsFolder)"

    $icon = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/icon" -Method Post -ContentType "application/json" -Body (@{ target = "C:\Windows\System32\notepad.exe" } | ConvertTo-Json)
    if (-not $icon.success) { throw "Icon extraction failed: $($icon.error)" }
    if ($icon.icon -notlike "/icons/*.png") { throw "Unexpected icon URL '$($icon.icon)'." }
    $png = Invoke-WebRequest -Uri "http://127.0.0.1:47802$($icon.icon)" -UseBasicParsing
    if ($png.StatusCode -ne 200 -or $png.Headers["Content-Type"] -notlike "image/png*") { throw "Icon was not served as a PNG." }
    if ($png.Headers["Cache-Control"] -notlike "*immutable*") { throw "Icon cache headers are missing." }
    Write-Host "  -> extracted $($icon.icon) ($($png.RawContentLength) bytes, immutable cache)"

    Write-Host "`n5. Built-in profiles are editable..."
    $cfg = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/config"
    $spotify = $cfg.profiles | Where-Object { $_.id -eq "spotify" }
    $gamer = $cfg.profiles | Where-Object { $_.id -eq "gamer" }
    if (-not $spotify -or -not $gamer) { throw "Spotify or Gamer profile is missing." }

    $spPrev = $spotify.pages[0].buttons | Where-Object { $_.id -eq "sp_prev" }
    $spNext = $spotify.pages[0].buttons | Where-Object { $_.id -eq "sp_next" }
    if (-not $spPrev -or -not $spNext) { throw "Spotify default buttons are missing." }
    $spPrev.pos.col = 2
    $spNext.pos.col = 0
    $spotify.pages[0].buttons = @($spotify.pages[0].buttons | Where-Object { $_.id -ne "sp_volup" })

    $gmBar = $gamer.pages[0].buttons | Where-Object { $_.id -eq "gm_bar" }
    $gmTab = $gamer.pages[0].buttons | Where-Object { $_.id -eq "gm_tab" }
    if (-not $gmBar -or -not $gmTab) { throw "Gamer default buttons are missing." }
    $gmBar.pos.col = 3
    $gmTab.pos.col = 0

    $saved = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/config" -Method Post -ContentType "application/json; charset=utf-8" -Body ($cfg | ConvertTo-Json -Depth 20)
    if (-not $saved.ok) { throw "The edited configuration was rejected." }

    $after = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/config"
    $spotifyAfter = $after.profiles | Where-Object { $_.id -eq "spotify" }
    $gamerAfter = $after.profiles | Where-Object { $_.id -eq "gamer" }
    $spPrevAfter = $spotifyAfter.pages[0].buttons | Where-Object { $_.id -eq "sp_prev" }
    $spNextAfter = $spotifyAfter.pages[0].buttons | Where-Object { $_.id -eq "sp_next" }
    $gmBarAfter = $gamerAfter.pages[0].buttons | Where-Object { $_.id -eq "gm_bar" }
    $gmTabAfter = $gamerAfter.pages[0].buttons | Where-Object { $_.id -eq "gm_tab" }

    if ($spotifyAfter.pages[0].buttons.Count -ne 4) { throw "Deleted Spotify buttons came back after saving." }
    if ($spPrevAfter.pos.col -ne 2 -or $spNextAfter.pos.col -ne 0) { throw "Spotify button positions were reset after saving." }
    if ($gmBarAfter.pos.col -ne 3 -or $gmTabAfter.pos.col -ne 0) { throw "Gamer button positions were reset after saving." }
    if ($spotifyAfter.PSObject.Properties.Name -contains "locked") { throw "Spotify is still marked as a locked profile." }
    Write-Host "  -> Spotify kept 4/5 buttons in the new order, Gamer kept its new order"

    Write-Host "`nAll v1.0.0 checks passed." -ForegroundColor Green
}
finally {
    if ($proc -and -not $proc.HasExited) { $proc.Kill(); $proc.WaitForExit() }
}
