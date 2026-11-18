$ErrorActionPreference = "Stop"

$exePath = "D:\Archivos\Proyectos_personales\NexoDeck\server\src\NexoDeck.Server\bin\Release\net8.0-windows10.0.19041.0\win-x64\publish\NexoDeck.Server.exe"
$dataDir = "D:\Archivos\Proyectos_personales\NexoDeck\.verify-data"

Write-Host "Starting NexoDeck.Server in background with data-dir $dataDir..."
$proc = Start-Process -FilePath $exePath -ArgumentList "--background --dev --data-dir `"$dataDir`"" -PassThru

try {
    Start-Sleep -Seconds 3

    Write-Host "1. Checking pairing and getting token..."
    $pairing = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/pairing" -Method Get
    $code = $pairing.code
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}
    $pairBody = @{ code = $code; deviceName = "PowerShell M5 Test Client" } | ConvertTo-Json
    $pairResponse = Invoke-RestMethod -Uri "https://127.0.0.1:47800/api/pair" -Method Post -Body $pairBody -ContentType "application/json"
    $token = $pairResponse.token

    Write-Host "2. Checking /api/admin/processes..."
    $procs = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/processes" -Method Get
    Write-Host "Found $($procs.Count) visible processes."
    if ($procs.Count -gt 0) {
        $first = $procs[0]
        Write-Host "Sample process: $($first.name) - $($first.title) (Icon: $($first.icon))"
    }

    Write-Host "3. Connecting WebSocket..."
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $cts = New-Object System.Threading.CancellationTokenSource(15000)
    $uri = New-Object System.Uri("ws://127.0.0.1:47801/ws")
    $ws.ConnectAsync($uri, $cts.Token).Wait()

    # Send hello
    $hello = @{
        v = 1
        t = "hello"
        d = @{
            token = $token
            deviceName = "PowerShell M5"
            clientVersion = "0.1.0"
        }
    } | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($hello)
    $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$bytes)
    $ws.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()

    # Read welcome message
    $buf = New-Object byte[] 65536
    $recvSegment = New-Object System.ArraySegment[byte] -ArgumentList @(,$buf)
    $result = $ws.ReceiveAsync($recvSegment, $cts.Token).Result
    $welcomeText = [System.Text.Encoding]::UTF8.GetString($buf, 0, $result.Count)
    $welcomeJson = $welcomeText | ConvertFrom-Json

    if ($welcomeJson.t -ne "welcome") { throw "Expected welcome, got $($welcomeJson.t)" }
    Write-Host "Welcome confirmed! Active profile: $($welcomeJson.d.activeProfileId), Pinned: $($welcomeJson.d.pinned)"
    if ($welcomeJson.d.activeProfileId -ne "global") {
        throw "Expected initial active profile 'global', got '$($welcomeJson.d.activeProfileId)'"
    }

    # Helper to drain messages until expected type is found
    function Wait-ForMessage($expectedType, $timeoutSec = 5) {
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        while ($stopwatch.ElapsedMilliseconds -lt ($timeoutSec * 1000)) {
            $pollCts = New-Object System.Threading.CancellationTokenSource(1500)
            try {
                $r = $ws.ReceiveAsync($recvSegment, $pollCts.Token).Result
                if ($r.Count -gt 0) {
                    $t = [System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)
                    $m = $t | ConvertFrom-Json
                    Write-Host "  -> WS received: t=$($m.t)"
                    if ($m.t -eq $expectedType) {
                        return $m
                    }
                }
            } catch [System.AggregateException] {
                # continue
            }
        }
        return $null
    }

    # 4. Test profile pinning
    Write-Host "`n4. Testing profile.pin to 'vscode'..."
    $pinMsg = @{
        v = 1
        t = "profile.pin"
        d = @{ profileId = "vscode" }
    } | ConvertTo-Json -Compress
    $pBytes = [System.Text.Encoding]::UTF8.GetBytes($pinMsg)
    $pSeg = New-Object System.ArraySegment[byte] -ArgumentList @(,$pBytes)
    $ws.SendAsync($pSeg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()

    $changed = Wait-ForMessage -expectedType "profile.changed"
    if ($null -eq $changed) { throw "Did not receive profile.changed after pin" }
    Write-Host "Profile changed received: $($changed | ConvertTo-Json -Compress)"
    if ($changed.d.profileId -ne "vscode" -or $changed.d.pinned -ne $true) {
        throw "Failed to pin profile: expected 'vscode' with pinned=true"
    }
    Write-Host "Pinned to 'vscode' successfully verified!"

    # 5. Test profile unpinning
    Write-Host "`n5. Testing profile unpin (profileId = null)..."
    $unpinMsg = @{
        v = 1
        t = "profile.pin"
        d = @{ profileId = $null }
    } | ConvertTo-Json -Compress
    $uBytes = [System.Text.Encoding]::UTF8.GetBytes($unpinMsg)
    $uSeg = New-Object System.ArraySegment[byte] -ArgumentList @(,$uBytes)
    $ws.SendAsync($uSeg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()

    $unpinned = Wait-ForMessage -expectedType "profile.changed"
    if ($null -eq $unpinned) { throw "Did not receive profile.changed after unpin" }
    Write-Host "Profile unpinned received: $($unpinned | ConvertTo-Json -Compress)"
    if ($unpinned.d.pinned -ne $false) {
        throw "Failed to unpin profile: pinned is not false"
    }
    Write-Host "Unpin successfully verified!"

    # 6. Test icon extraction
    Write-Host "`n6. Testing icon extraction for explorer.exe..."
    $explorerPath = "C:\Windows\explorer.exe"
    if (Test-Path $explorerPath) {
        # Check if any icon file was created or if endpoint responds
        $icons = Get-ChildItem -Path "$dataDir\icons" -Filter "*.png"
        Write-Host "Cached icons count in dataDir: $($icons.Count)"
        if ($icons.Count -gt 0) {
            $iconHash = $icons[0].BaseName
            $iconUrl = "http://127.0.0.1:47801/icons/$iconHash.png"
            Write-Host "Fetching icon: $iconUrl..."
            $iconResp = Invoke-WebRequest -Uri $iconUrl -Method Get
            Write-Host "Icon status: $($iconResp.StatusCode), Content-Type: $($iconResp.Headers['Content-Type']), Size: $($iconResp.RawContentLength) bytes"
            if ($iconResp.StatusCode -ne 200 -or $iconResp.Headers['Content-Type'] -ne "image/png") {
                throw "Icon serving failed"
            }
            Write-Host "Icon serving successfully verified!"
        }
    }

    Write-Host "`nMilestone 5 verification completed successfully!"
    $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", [System.Threading.CancellationToken]::None).Wait()
}
finally {
    if ($proc -and -not $proc.HasExited) {
        Write-Host "Stopping NexoDeck.Server process (PID: $($proc.Id))..."
        Stop-Process -Id $proc.Id -Force
    }
}
