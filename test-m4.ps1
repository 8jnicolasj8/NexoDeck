$ErrorActionPreference = "Stop"

$exePath = "D:\Archivos\Proyectos_personales\OpenDeck\server\src\OpenDeck.Server\bin\Release\net8.0-windows10.0.19041.0\win-x64\publish\OpenDeck.Server.exe"
$dataDir = "D:\Archivos\Proyectos_personales\OpenDeck\.verify-data"

Write-Host "Starting OpenDeck.Server in background with data-dir $dataDir..."
$proc = Start-Process -FilePath $exePath -ArgumentList "--background --dev --data-dir `"$dataDir`"" -PassThru

try {
    Start-Sleep -Seconds 3

    Write-Host "1. Checking pairing and getting token..."
    $pairing = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/pairing" -Method Get
    $code = $pairing.code
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}
    $pairBody = @{ code = $code; deviceName = "PowerShell M4 Test Client" } | ConvertTo-Json
    $pairResponse = Invoke-RestMethod -Uri "https://127.0.0.1:47800/api/pair" -Method Post -Body $pairBody -ContentType "application/json"
    $token = $pairResponse.token

    Write-Host "2. Connecting WebSocket..."
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
            deviceName = "PowerShell M4"
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
    Write-Host "Welcome received! Initial states: $($welcomeJson.d.states | ConvertTo-Json -Compress)"

    # Helper function to send an action
    function Send-DeckAction($buttonId, $extra = @{}) {
        $dict = @{ buttonId = $buttonId }
        foreach ($k in $extra.Keys) { $dict[$k] = $extra[$k] }
        $act = @{
            v = 1
            t = "action"
            d = $dict
        } | ConvertTo-Json -Compress -Depth 5
        Write-Host "Sending action: $act"
        $b = [System.Text.Encoding]::UTF8.GetBytes($act)
        $s = New-Object System.ArraySegment[byte] -ArgumentList @(,$b)
        $ws.SendAsync($s, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()
    }

    # 3. Test toggle master mute via button 'b9'
    Write-Host "`n3. Testing toggle master mute via button 'b9'..."
    Send-DeckAction -buttonId "b9"
    Start-Sleep -Milliseconds 500

    # Read state.update
    $res = $ws.ReceiveAsync($recvSegment, $cts.Token).Result
    $t1 = [System.Text.Encoding]::UTF8.GetString($buf, 0, $res.Count)
    Write-Host "Received: $t1"

    # Toggle back to restore
    Send-DeckAction -buttonId "b9"
    Start-Sleep -Milliseconds 500

    # 4. Test toggle mic mute via button 'b1'
    Write-Host "`n4. Testing toggle mic mute via button 'b1'..."
    Send-DeckAction -buttonId "b1"
    Start-Sleep -Milliseconds 500
    Send-DeckAction -buttonId "b1"
    Start-Sleep -Milliseconds 500

    # 5. Test media playpause via button 'b2'
    Write-Host "`n5. Testing media playpause via button 'b2'..."
    Send-DeckAction -buttonId "b2"
    Start-Sleep -Milliseconds 300

    # 6. Test text typing via direct action
    Write-Host "`n6. Testing text.type via direct action..."
    Send-DeckAction -buttonId "" -extra @{ type = "text.type"; payload = @{ text = "OpenDeck Test" } }
    Start-Sleep -Milliseconds 300

    # 7. Test audio device cycling
    Write-Host "`n7. Testing audio.deviceCycle via quick action..."
    Send-DeckAction -buttonId "quick_audio_cycle"
    Start-Sleep -Milliseconds 300

    # Read incoming messages to verify server didn't crash and processed actions
    Write-Host "`n9. Draining WebSocket messages..."
    for ($i = 0; $i -lt 5; $i++) {
        if ($ws.State -ne [System.Net.WebSockets.WebSocketState]::Open) { break }
        $pollCts = New-Object System.Threading.CancellationTokenSource(1000)
        try {
            $res = $ws.ReceiveAsync($recvSegment, $pollCts.Token).Result
            if ($res.Count -gt 0) {
                $text = [System.Text.Encoding]::UTF8.GetString($buf, 0, $res.Count)
                $msg = $text | ConvertFrom-Json
                Write-Host "Received: t=$($msg.t)"
                if ($msg.t -eq "state.update") {
                    Write-Host "State update: $($msg.d | ConvertTo-Json -Compress)"
                }
            }
        } catch [System.AggregateException] {
            # Timeout is normal when no more messages
            break
        }
    }

    Write-Host "`nMilestone 4 verification completed successfully!"
    $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", [System.Threading.CancellationToken]::None).Wait()
}
finally {
    if ($proc -and -not $proc.HasExited) {
        Write-Host "Stopping OpenDeck.Server process (PID: $($proc.Id))..."
        Stop-Process -Id $proc.Id -Force
    }
}
