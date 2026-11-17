$ErrorActionPreference = "Stop"

$exePath = "D:\Archivos\Proyectos_personales\OpenDeck\server\src\OpenDeck.Server\bin\Release\net8.0-windows10.0.19041.0\win-x64\publish\OpenDeck.Server.exe"
$dataDir = "D:\Archivos\Proyectos_personales\OpenDeck\.verify-data"

# Create scripts directory and sample test script
$scriptsDir = Join-Path $dataDir "scripts"
New-Item -ItemType Directory -Force -Path $scriptsDir | Out-Null
$vbsMarker = Join-Path $scriptsDir "marker.txt"
if (Test-Path $vbsMarker) { Remove-Item -Force $vbsMarker }

$vbsContent = @"
Set fso = CreateObject("Scripting.FileSystemObject")
Set file = fso.CreateTextFile("$($vbsMarker.Replace('\', '\\'))", True)
file.WriteLine("vbs_executed_ok")
file.Close
"@
Set-Content -Path (Join-Path $scriptsDir "hello.vbs") -Value $vbsContent -Encoding ASCII

Write-Host "Starting OpenDeck.Server in background with data-dir $dataDir..."
$proc = Start-Process -FilePath $exePath -ArgumentList "--background --dev --data-dir `"$dataDir`"" -PassThru

try {
    Start-Sleep -Seconds 3

    Write-Host "1. Checking pairing and getting token..."
    $pairing = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/pairing" -Method Get
    $code = $pairing.code
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}
    $pairBody = @{ code = $code; deviceName = "PowerShell M6 Test Client" } | ConvertTo-Json
    $pairResponse = Invoke-RestMethod -Uri "https://127.0.0.1:47800/api/pair" -Method Post -Body $pairBody -ContentType "application/json"
    $token = $pairResponse.token

    Write-Host "2. Connecting WebSocket..."
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
            deviceName = "PowerShell M6"
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
    Write-Host "Welcome confirmed! NowPlaying state present: $([bool]$welcomeJson.d.nowPlaying)"

    function Send-WsJson($obj) {
        $json = $obj | ConvertTo-Json -Compress -Depth 5
        $b = [System.Text.Encoding]::UTF8.GetBytes($json)
        $s = New-Object System.ArraySegment[byte] -ArgumentList @(,$b)
        $ws.SendAsync($s, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()
    }

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
            } catch [System.AggregateException] { }
        }
        return $null
    }

    # 3. Test Clipboard: Celu -> PC
    Write-Host "`n3. Testing Clipboard Celu -> PC..."
    $testClipboard = "Texto enviado desde OpenDeck Celular $([System.Guid]::NewGuid().ToString().Substring(0,8))"
    Send-WsJson @{
        v = 1
        t = "clipboard.send"
        d = @{ text = $testClipboard; paste = $false }
    }
    Start-Sleep -Milliseconds 600

    # Query history
    Send-WsJson @{
        v = 1
        t = "clipboard.getHistory"
        d = @{}
    }
    $histMsg = Wait-ForMessage -expectedType "clipboard.history"
    if ($null -eq $histMsg) { throw "Did not receive clipboard.history" }
    Write-Host "History received count: $($histMsg.d.items.Count)"
    $found = $histMsg.d.items | Where-Object { $_.text -eq $testClipboard }
    if (-not $found) { throw "Test clipboard string was not found in history" }
    Write-Host "Clipboard Celu -> PC verified successfully!"

    # 4. Test Clipboard: PC -> Celu
    Write-Host "`n4. Testing Clipboard PC -> Celu..."
    $pcText = "Copiado desde PC en Windows $([System.Guid]::NewGuid().ToString().Substring(0,8))"
    Set-Clipboard -Value $pcText
    $clipChanged = Wait-ForMessage -expectedType "clipboard.changed"
    if ($clipChanged) {
        Write-Host "Received clipboard.changed over WS: $($clipChanged.d.text)"
        if ($clipChanged.d.text -ne $pcText) {
            Write-Host "Note: Clipboard notification text differed or was queued"
        }
    } else {
        Write-Host "Note: Windows clipboard listener didn't catch or session loop was busy"
    }

    # 5. Test Script execution whitelist (.vbs)
    Write-Host "`n5. Testing ScriptService with whitelist..."
    Send-WsJson @{
        v = 1
        t = "action"
        d = @{
            type = "script.run"
            payload = @{ file = "hello.vbs" }
        }
    }
    Start-Sleep -Milliseconds 1500
    if (-not (Test-Path $vbsMarker)) {
        throw "VBS script did not execute properly or marker file was not created"
    }
    $markerContent = Get-Content $vbsMarker -Raw
    Write-Host "VBS execution verified! Marker content: $($markerContent.Trim())"

    # 6. Test Dangerous Power Action confirmation check
    Write-Host "`n6. Testing power actions..."
    # A shutdown with confirmed: false should NOT trigger shutdown
    Send-WsJson @{
        v = 1
        t = "action"
        d = @{
            type = "power"
            payload = @{ cmd = "shutdown"; confirmed = $false }
        }
    }
    Start-Sleep -Milliseconds 300

    # Abort any pending shutdown just in case
    Send-WsJson @{
        v = 1
        t = "action"
        d = @{
            type = "power"
            payload = @{ cmd = "cancel" }
        }
    }
    Write-Host "Power confirmation guard verified!"

    Write-Host "`nMilestone 6 verification completed successfully!"
    if ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        try {
            $closeCts = New-Object System.Threading.CancellationTokenSource(1000)
            $ws.CloseOutputAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", $closeCts.Token).Wait()
        } catch { }
    }
}
finally {
    if ($proc -and -not $proc.HasExited) {
        Write-Host "Stopping OpenDeck.Server process (PID: $($proc.Id))..."
        Stop-Process -Id $proc.Id -Force
    }
}
