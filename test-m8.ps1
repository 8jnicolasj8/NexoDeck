$ErrorActionPreference = "Stop"

$exePath = "D:\Archivos\Proyectos_personales\NexoDeck\server\src\NexoDeck.Server\bin\Release\net8.0-windows10.0.19041.0\win-x64\publish\NexoDeck.Server.exe"
$dataDir = "D:\Archivos\Proyectos_personales\NexoDeck\.verify-data"

Write-Host "Starting NexoDeck.Server in background with data-dir $dataDir..."
$proc = Start-Process -FilePath $exePath -ArgumentList "--background --dev --data-dir `"$dataDir`"" -PassThru

try {
    Start-Sleep -Seconds 3

    # 1. Test PWA files over HTTP LAN
    Write-Host "`n1. Testing Mobile PWA serving on port 47801..."
    $indexHtml = Invoke-RestMethod -Uri "http://127.0.0.1:47801/" -Method Get
    if ($indexHtml -notmatch "NexoDeck" -and $indexHtml -notmatch "root") {
        throw "PWA index.html missing expected content"
    }
    Write-Host "  -> PWA index.html served OK ($($indexHtml.Length) bytes)"

    $manifest = Invoke-RestMethod -Uri "http://127.0.0.1:47801/manifest.webmanifest" -Method Get
    if ($manifest.name -ne "NexoDeck") {
        throw "Expected manifest name 'NexoDeck', got '$($manifest.name)'"
    }
    Write-Host "  -> manifest.webmanifest served OK: Name=$($manifest.name), Icons=$($manifest.icons.Count)"

    # 2. Pair client
    Write-Host "`n2. Pairing client..."
    $pairing = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/pairing" -Method Get
    $code = $pairing.code
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}
    $pairBody = @{ code = $code; deviceName = "PowerShell M8 Test Client" } | ConvertTo-Json
    $pairResponse = Invoke-RestMethod -Uri "https://127.0.0.1:47800/api/pair" -Method Post -Body $pairBody -ContentType "application/json"
    $token = $pairResponse.token

    # 3. Connect WebSocket
    Write-Host "`n3. Connecting WebSocket client..."
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $cts = New-Object System.Threading.CancellationTokenSource(20000)
    $uri = New-Object System.Uri("ws://127.0.0.1:47801/ws")
    $ws.ConnectAsync($uri, $cts.Token).Wait()

    # Send hello
    $hello = @{
        v = 1
        t = "hello"
        d = @{
            token = $token
            deviceName = "PowerShell M8"
            clientVersion = "0.1.0"
        }
    } | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($hello)
    $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$bytes)
    $ws.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()

    # Read welcome message
    $ms = New-Object System.IO.MemoryStream
    $buf = New-Object byte[] 8192
    do {
        $recvSegment = New-Object System.ArraySegment[byte] -ArgumentList @(,$buf)
        $result = $ws.ReceiveAsync($recvSegment, $cts.Token).Result
        $ms.Write($buf, 0, $result.Count)
    } while (-not $result.EndOfMessage)
    $welcomeText = [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
    $welcomeJson = $welcomeText | ConvertFrom-Json
    if ($welcomeJson.t -ne "welcome") { throw "Expected welcome, got $($welcomeJson.t)" }
    Write-Host "  -> Welcome confirmed!"

    # 4. Verify temperature alerts exist in config
    Write-Host "`n4. Verifying Temperature Alerts in config..."
    $config = $welcomeJson.d.config
    $tempAlert = $config.alerts | Where-Object { $_.metric -eq "cpu.temp" -and $_.value -eq 85 }
    if (-not $tempAlert) {
        throw "Alert for cpu.temp > 85 not found in config"
    }
    Write-Host "  -> Alert found: $($tempAlert.metric) $($tempAlert.op) $($tempAlert.value) (Vibrate=$($tempAlert.vibrate))"

    # 5. Test layout.reorder message
    Write-Host "`n5. Testing layout.reorder message (Swapping button positions)..."
    $globalProfile = $config.profiles | Where-Object { $_.id -eq "global" }
    $p1 = $globalProfile.pages[0]
    $buttons = $p1.buttons

    # Swap positions of button 0 and button 1
    $b0 = $buttons[0]
    $b1 = $buttons[1]
    Write-Host "  Original: Button 0 ($($b0.label)) at ($($b0.pos.row), $($b0.pos.col))"
    Write-Host "  Original: Button 1 ($($b1.label)) at ($($b1.pos.row), $($b1.pos.col))"

    $swappedButtons = @()
    foreach ($b in $buttons) {
        if ($b.id -eq $b0.id) {
            $swappedButtons += @{
                id = $b.id
                type = $b.type
                label = $b.label
                icon = $b.icon
                pos = @{ row = $b1.pos.row; col = $b1.pos.col; rowSpan = 1; colSpan = 1 }
                action = $b.action
                stateBinding = $b.stateBinding
            }
        } elseif ($b.id -eq $b1.id) {
            $swappedButtons += @{
                id = $b.id
                type = $b.type
                label = $b.label
                icon = $b.icon
                pos = @{ row = $b0.pos.row; col = $b0.pos.col; rowSpan = 1; colSpan = 1 }
                action = $b.action
                stateBinding = $b.stateBinding
            }
        } else {
            $swappedButtons += @{
                id = $b.id
                type = $b.type
                label = $b.label
                icon = $b.icon
                pos = $b.pos
                action = $b.action
                stateBinding = $b.stateBinding
            }
        }
    }

    $reorderMsg = @{
        v = 1
        t = "layout.reorder"
        d = @{
            profileId = "global"
            pageId = $p1.id
            buttons = $swappedButtons
        }
    } | ConvertTo-Json -Depth 6 -Compress

    $reorderBytes = [System.Text.Encoding]::UTF8.GetBytes($reorderMsg)
    $reorderSegment = New-Object System.ArraySegment[byte] -ArgumentList @(,$reorderBytes)
    $ws.SendAsync($reorderSegment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()
    Write-Host "  -> layout.reorder sent!"

    # 6. Verify layout.reordered response and config.updated broadcast
    Write-Host "`n6. Waiting for layout.reordered response and config.updated broadcast..."
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $reorderedAck = $false
    $configBroadcastReceived = $false

    while ($stopwatch.ElapsedMilliseconds -lt 6000 -and (-not $reorderedAck -or -not $configBroadcastReceived)) {
        $pollCts = New-Object System.Threading.CancellationTokenSource(1500)
        try {
            $frameMs = New-Object System.IO.MemoryStream
            do {
                $r = $ws.ReceiveAsync($recvSegment, $pollCts.Token).Result
                if ($r.Count -gt 0) {
                    $frameMs.Write($buf, 0, $r.Count)
                }
            } while (-not $r.EndOfMessage)
            if ($frameMs.Length -gt 0) {
                $msgText = [System.Text.Encoding]::UTF8.GetString($frameMs.ToArray())
                $msg = $msgText | ConvertFrom-Json
                Write-Host "  -> WS received: $($msg.t)"
                if ($msg.t -eq "layout.reordered") {
                    $reorderedAck = $true
                    Write-Host "  -> Confirmed layout.reordered ACK!"
                }
                if ($msg.t -eq "config.updated") {
                    $configBroadcastReceived = $true
                    Write-Host "  -> Confirmed config.updated broadcast!"
                }
            }
        } catch [System.AggregateException] { }
    }

    if (-not $reorderedAck) { throw "Did not receive layout.reordered ACK" }
    if (-not $configBroadcastReceived) { throw "Did not receive config.updated broadcast" }

    # Close WS
    try {
        $ws.CloseOutputAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Test done", [System.Threading.CancellationToken]::None).Wait()
    } catch { }

    Write-Host "`n==============================================="
    Write-Host " MILESTONE 8 VERIFICATION SUCCESSFUL!" -ForegroundColor Green
    Write-Host "==============================================="
}
finally {
    if ($proc -and -not $proc.HasExited) {
        Write-Host "Stopping NexoDeck.Server (PID $($proc.Id))..."
        $proc.Kill()
        $proc.WaitForExit()
        Write-Host "Stopped."
    }
}
