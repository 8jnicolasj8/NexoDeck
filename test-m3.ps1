$ErrorActionPreference = "Stop"

$exePath = "D:\Archivos\Proyectos_personales\OpenDeck\server\src\OpenDeck.Server\bin\Release\net8.0-windows10.0.19041.0\win-x64\publish\OpenDeck.Server.exe"
$dataDir = "D:\Archivos\Proyectos_personales\OpenDeck\.verify-data"

Write-Host "Starting OpenDeck.Server in background with data-dir $dataDir..."
$proc = Start-Process -FilePath $exePath -ArgumentList "--background --dev --data-dir `"$dataDir`"" -PassThru

try {
    Start-Sleep -Seconds 3

    Write-Host "Checking /api/health on loopback port 47802..."
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/health" -Method Get
    Write-Host "Health: $($health | ConvertTo-Json -Compress)"
    if ($health.status -ne "ok") { throw "Health check failed" }

    Write-Host "Checking root HTTP client page on LAN port 47801..."
    $indexHtml = Invoke-WebRequest -Uri "http://127.0.0.1:47801/" -Method Get
    Write-Host "HTTP Status: $($indexHtml.StatusCode)"
    if ($indexHtml.Content -notmatch '<div id="root">') {
        throw "index.html did not contain root div"
    }
    Write-Host "index.html successfully served!"

    Write-Host "Getting pairing code from admin API..."
    $pairing = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/pairing" -Method Get
    $code = $pairing.code
    Write-Host "Pairing code: $code"

    Write-Host "Pairing device via /api/pair on HTTPS 47800..."
    # Bypass local self-signed cert check in PowerShell for testing
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}
    $pairBody = @{ code = $code; deviceName = "PowerShell Test Client" } | ConvertTo-Json
    $pairResponse = Invoke-RestMethod -Uri "https://127.0.0.1:47800/api/pair" -Method Post -Body $pairBody -ContentType "application/json"
    $token = $pairResponse.token
    Write-Host "Device paired! Token received: $($token.Substring(0, 10))..."

    Write-Host "Testing WebSocket on ws://127.0.0.1:47801/ws..."
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $cts = New-Object System.Threading.CancellationTokenSource(10000)
    $uri = New-Object System.Uri("ws://127.0.0.1:47801/ws")
    $ws.ConnectAsync($uri, $cts.Token).Wait()
    Write-Host "WebSocket connected!"

    # Send hello
    $hello = @{
        v = 1
        t = "hello"
        d = @{
            token = $token
            deviceName = "PowerShell Test"
            clientVersion = "0.1.0"
        }
    } | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($hello)
    $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$bytes)
    $ws.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()
    Write-Host "Sent hello message."

    # Receive welcome
    $buf = New-Object byte[] 65536
    $recvSegment = New-Object System.ArraySegment[byte] -ArgumentList @(,$buf)
    $result = $ws.ReceiveAsync($recvSegment, $cts.Token).Result
    $welcomeText = [System.Text.Encoding]::UTF8.GetString($buf, 0, $result.Count)
    Write-Host "Received response: $($welcomeText.Substring(0, [Math]::Min(120, $welcomeText.Length)))..."
    $welcomeJson = $welcomeText | ConvertFrom-Json
    if ($welcomeJson.t -ne "welcome") { throw "Expected welcome, got $($welcomeJson.t)" }
    Write-Host "Welcome confirmed! Active profile: $($welcomeJson.d.activeProfileId)"

    # Receive telemetry
    Write-Host "Waiting for telemetry broadcast..."
    $foundTelemetry = $false
    for ($i = 0; $i -lt 5; $i++) {
        $result = $ws.ReceiveAsync($recvSegment, $cts.Token).Result
        $msgText = [System.Text.Encoding]::UTF8.GetString($buf, 0, $result.Count)
        $msg = $msgText | ConvertFrom-Json
        Write-Host "Received WS msg: t=$($msg.t)"
        if ($msg.t -eq "telemetry") {
            $foundTelemetry = $true
            Write-Host "Telemetry metrics received: $($msg.d.m | ConvertTo-Json -Compress)"
            break
        }
    }

    if (-not $foundTelemetry) { throw "Did not receive telemetry message within timeout" }

    # Test ping/pong
    Write-Host "Testing ping/pong..."
    $ping = @{ v = 1; t = "ping"; d = @{ ts = 987654321 } } | ConvertTo-Json -Compress
    $pBytes = [System.Text.Encoding]::UTF8.GetBytes($ping)
    $pSegment = New-Object System.ArraySegment[byte] -ArgumentList @(,$pBytes)
    $ws.SendAsync($pSegment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()

    $result = $ws.ReceiveAsync($recvSegment, $cts.Token).Result
    $pongText = [System.Text.Encoding]::UTF8.GetString($buf, 0, $result.Count)
    $pong = $pongText | ConvertFrom-Json
    Write-Host "Pong received: $($pongText)"
    if ($pong.t -ne "pong" -or $pong.d.ts -ne 987654321) { throw "Pong validation failed" }

    $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", [System.Threading.CancellationToken]::None).Wait()
    Write-Host "`n>>> ALL M3 SERVER & CLIENT CRITERIA VERIFIED SUCCESSFULLY! <<<`n"
}
finally {
    Write-Host "Terminating background test server process..."
    if ($proc -and -not $proc.HasExited) {
        Stop-Process -Id $proc.Id -Force
    }
}
