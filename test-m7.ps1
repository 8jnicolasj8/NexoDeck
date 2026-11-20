$ErrorActionPreference = "Stop"

$exePath = "D:\Archivos\Proyectos_personales\VexaDeck\server\src\VexaDeck.Server\bin\Release\net8.0-windows10.0.19041.0\win-x64\publish\VexaDeck.Server.exe"
$dataDir = "D:\Archivos\Proyectos_personales\VexaDeck\.verify-data"

Write-Host "Starting VexaDeck.Server in background with data-dir $dataDir..."
$proc = Start-Process -FilePath $exePath -ArgumentList "--background --dev --data-dir `"$dataDir`"" -PassThru

try {
    Start-Sleep -Seconds 3

    # 1. Test Admin HTML page
    Write-Host "`n1. Testing GET /admin (Admin UI HTML)..."
    $adminHtml = Invoke-RestMethod -Uri "http://127.0.0.1:47802/admin" -Method Get
    if ($adminHtml -notmatch "VexaDeck") { throw "Admin HTML did not contain 'VexaDeck'" }
    Write-Host "  -> Admin HTML retrieved OK ($($adminHtml.Length) bytes)"

    # 2. Test Overview endpoint
    Write-Host "`n2. Testing GET /api/admin/overview..."
    $overview = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/overview" -Method Get
    if (-not $overview.running -or -not $overview.ip) { throw "Overview missing running or IP" }
    Write-Host "  -> Overview OK: IP=$($overview.ip), Ports=$($overview.ports -join ', ')"

    # 3. Test Telemetry endpoint
    Write-Host "`n3. Testing GET /api/admin/telemetry..."
    $telemetry = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/telemetry" -Method Get
    Write-Host "  -> Telemetry OK: CPU Load=$($telemetry.'cpu.load')%, RAM=$($telemetry.'ram.used')%"

    # 4. Test Processes endpoint
    Write-Host "`n4. Testing GET /api/admin/processes..."
    $processes = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/processes" -Method Get
    if ($processes.Count -lt 5) { throw "Expected running processes list" }
    Write-Host "  -> Processes OK: Found $($processes.Count) running processes (sample: $($processes[0].name))"

    # 5. Test Scripts endpoints
    Write-Host "`n5. Testing Scripts API..."
    $sampleRes = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/scripts/sample" -Method Post
    Write-Host "  -> Sample script created: $($sampleRes.file)"
    
    $scriptsList = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/scripts" -Method Get
    $sampleFound = $scriptsList | Where-Object { $_.file -eq "ejemplo_hola.vbs" }
    if (-not $sampleFound) { throw "Sample script 'ejemplo_hola.vbs' not found in scripts list" }
    Write-Host "  -> Scripts list verified: Found $($scriptsList.Count) scripts"

    # 6. Pair a device and establish WebSocket connection to test live config broadcast
    Write-Host "`n6. Pairing client to receive live WebSocket broadcasts..."
    $pairing = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/pairing" -Method Get
    $code = $pairing.code
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    $pairBody = @{ code = $code; deviceName = "PowerShell M7 Test Client" } | ConvertTo-Json
    $pairResponse = Invoke-RestMethod -Uri "https://127.0.0.1:47800/api/pair" -Method Post -Body $pairBody -ContentType "application/json"
    $token = $pairResponse.token

    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $cts = New-Object System.Threading.CancellationTokenSource(20000)
    $uri = New-Object System.Uri("ws://127.0.0.1:47801/ws")
    $ws.ConnectAsync($uri, $cts.Token).Wait()

    # Send hello
    $hello = @{
        v = 1
        t = "hello"
        d = @{
            token         = $token
            deviceName    = "PowerShell M7"
            clientVersion = "0.1.0"
        }
    } | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($hello)
    $segment = New-Object System.ArraySegment[byte] -ArgumentList @(, $bytes)
    $ws.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()

    # Read welcome message
    $ms = New-Object System.IO.MemoryStream
    $buf = New-Object byte[] 8192
    do {
        $recvSegment = New-Object System.ArraySegment[byte] -ArgumentList @(, $buf)
        $result = $ws.ReceiveAsync($recvSegment, $cts.Token).Result
        $ms.Write($buf, 0, $result.Count)
    } while (-not $result.EndOfMessage)
    $welcomeText = [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
    $welcomeJson = $welcomeText | ConvertFrom-Json
    if ($welcomeJson.t -ne "welcome") { throw "Expected welcome, got $($welcomeJson.t)" }
    Write-Host "  -> WebSocket client connected and authenticated"

    # 7. Test Config Read and Save with live broadcast
    Write-Host "`n7. Testing GET /api/admin/config and POST /api/admin/config..."
    $currentConfig = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/config" -Method Get

    # Add a new test profile to config
    $newProfile = @{
        id     = "m7_test_profile"
        name   = "M7 Custom Profile"
        accent = "#FF0055"
        grid   = @{ cols = 3; rows = 3 }
        pages  = @(
            @{
                id      = "m7_p1"
                name    = "Página Test"
                buttons = @(
                    @{
                        id     = "m7_btn1"
                        type   = "action"
                        label  = "Acción Test"
                        icon   = @{ kind = "lucide"; value = "terminal" }
                        pos    = @{ row = 0; col = 0; rowSpan = 1; colSpan = 1 }
                        action = @{ kind = "hotkey"; params = @{ keys = @("ctrl", "alt", "t") } }
                    }
                )
            }
        )
        match  = @{ processes = @("testapp.exe") }
    }

    # Append to profiles array
    $profilesList = [System.Collections.ArrayList]@($currentConfig.profiles)
    $profilesList.Add($newProfile) | Out-Null
    $currentConfig.profiles = $profilesList

    $updatedJson = $currentConfig | ConvertTo-Json -Depth 10
    $utf8Bytes = [System.Text.Encoding]::UTF8.GetBytes($updatedJson)
    try {
        $saveResponse = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/config" -Method Post -Body $utf8Bytes -ContentType "application/json; charset=utf-8"
        Write-Host "  -> Config POST completed"
    }
    catch {
        if ($_.Exception.Response) {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $body = $reader.ReadToEnd()
            Write-Host "Server error response: $body" -ForegroundColor Red
        }
        throw
    }

    # 8. Verify WebSocket receives config.updated with the new profile!
    Write-Host "`n8. Verifying WebSocket received config.updated broadcast..."
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $configUpdatedReceived = $false

    while ($stopwatch.ElapsedMilliseconds -lt 6000) {
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
                if ($msg.t -eq "config.updated") {
                    $hasTestProf = $msg.d.config.profiles | Where-Object { $_.id -eq "m7_test_profile" }
                    if ($hasTestProf) {
                        $configUpdatedReceived = $true
                        Write-Host "  -> Confirmed config.updated contains 'm7_test_profile'!"
                        break
                    }
                }
            }
        }
        catch [System.AggregateException] { }
    }

    if (-not $configUpdatedReceived) {
        throw "Did not receive config.updated with m7_test_profile within timeout"
    }

    # 9. Test Config Export
    Write-Host "`n9. Testing GET /api/admin/config/export..."
    $exportedConfig = Invoke-RestMethod -Uri "http://127.0.0.1:47802/api/admin/config/export" -Method Get
    $exportHasProf = $exportedConfig.profiles | Where-Object { $_.id -eq "m7_test_profile" }
    if (-not $exportHasProf) { throw "Exported config missing m7_test_profile" }
    Write-Host "  -> Config export confirmed OK!"

    # Close WS
    try {
        $ws.CloseOutputAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Test done", [System.Threading.CancellationToken]::None).Wait()
    }
    catch { }

    Write-Host "`n==============================================="
    Write-Host " MILESTONE 7 VERIFICATION SUCCESSFUL!" -ForegroundColor Green
    Write-Host "==============================================="
}
finally {
    if ($proc -and -not $proc.HasExited) {
        Write-Host "Stopping VexaDeck.Server (PID $($proc.Id))..."
        $proc.Kill()
        $proc.WaitForExit()
        Write-Host "Stopped."
    }
}
