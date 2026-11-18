<#
  NexoDeck - RAM measurement tool (Milestone E0/E5).

  Reports the private working set ("Working Set - Private") of nexodeck.server.exe
  and every msedgewebview2.exe owned by it, in three scenarios:

    A  Panel window open.
    B  Window closed (tray only).
    C  Window closed + one paired phone connected (Deck view).

  Uses Win32_PerfRawData_PerfProc_Process because its property names are culture
  independent (Get-Counter counter paths are localized).

  Examples:
    .\tools\measure-ram.ps1 -Scenario All
    .\tools\measure-ram.ps1 -Scenario B -Samples 5 -IntervalMs 2000
    .\tools\measure-ram.ps1 -Scenario All -ExePath .\server\src\NexoDeck.Server\bin\Release\...\NexoDeck.Server.exe
#>
[CmdletBinding()]
param(
    [ValidateSet('A', 'B', 'C', 'All')]
    [string]$Scenario = 'All',
    [string]$ExePath,
    [string]$DataDir,
    [int]$Samples = 5,
    [int]$IntervalMs = 2000,
    [string]$Label = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$repoRoot = (Get-Item (Join-Path $PSScriptRoot '..')).FullName
if (-not $ExePath) {
    # Prefer the self-contained publish: the debug build needs the .NET 8 runtime installed.
    $candidates = @(
        (Join-Path $repoRoot 'server\src\NexoDeck.Server\bin\Release\net8.0-windows10.0.19041.0\win-x64\publish\NexoDeck.Server.exe'),
        (Join-Path $repoRoot 'server\src\NexoDeck.Server\bin\Debug\net8.0-windows10.0.19041.0\NexoDeck.Server.exe')
    )
    $ExePath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $ExePath -or -not (Test-Path $ExePath)) { throw "NexoDeck.Server.exe not found. Build it or pass -ExePath." }
$ExePath = (Resolve-Path $ExePath).Path
if (-not $DataDir) { $DataDir = Join-Path $repoRoot '.measure-data' }
$DataDir = [System.IO.Path]::GetFullPath($DataDir)

$exeName = [System.IO.Path]::GetFileNameWithoutExtension($ExePath).ToLowerInvariant()

# --- Win32 helpers -----------------------------------------------------------
if (-not ('NexoDeck.Measure.Native' -as [type])) {
    Add-Type -Namespace NexoDeck.Measure -Name Native -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool PostMessage(System.IntPtr hWnd, uint Msg, System.IntPtr wParam, System.IntPtr lParam);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool IsWindowVisible(System.IntPtr hWnd);
'@
}

function Get-ProcessTree {
    $all = Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, Name -ErrorAction SilentlyContinue
    $map = @{}
    foreach ($p in $all) { $map[[int]$p.ProcessId] = $p }
    return $map
}

function Get-OwnedPids([int]$RootPid, $Map) {
    $owned = [System.Collections.Generic.HashSet[int]]::new()
    [void]$owned.Add($RootPid)
    $queue = [System.Collections.Generic.Queue[int]]::new()
    $queue.Enqueue($RootPid)
    while ($queue.Count -gt 0) {
        $parent = $queue.Dequeue()
        foreach ($p in $Map.Values) {
            if ([int]$p.ParentProcessId -eq $parent) {
                if ($owned.Add([int]$p.ProcessId)) { $queue.Enqueue([int]$p.ProcessId) }
            }
        }
    }
    return $owned
}

function Get-WorkingSetPrivate([int[]]$Pids) {
    $perf = Get-CimInstance Win32_PerfRawData_PerfProc_Process -ErrorAction SilentlyContinue |
        Where-Object { $Pids -contains [int]$_.IDProcess }
    $perf | ForEach-Object {
        [pscustomobject]@{
            PID   = [int]$_.IDProcess
            Name  = ($_.Name -replace '#.*$', '')
            Bytes = [double]$_.WorkingSetPrivate
        }
    }
}

function Get-Snapshot([int]$RootPid) {
    $map = Get-ProcessTree
    $owned = Get-OwnedPids -RootPid $RootPid -Map $map
    $rows = Get-WorkingSetPrivate -Pids @($owned)
    $server = $rows | Where-Object { $_.PID -eq $RootPid }
    $edge = $rows | Where-Object { $_.Name -eq 'msedgewebview2' }
    $other = $rows | Where-Object { $_.PID -ne $RootPid -and $_.Name -ne 'msedgewebview2' }
    [pscustomobject]@{
        ServerMb   = [math]::Round((($server | Measure-Object Bytes -Sum).Sum) / 1MB, 1)
        EdgeCount  = @($edge).Count
        EdgeMb     = [math]::Round((($edge | Measure-Object Bytes -Sum).Sum) / 1MB, 1)
        OtherCount = @($other).Count
        OtherMb    = [math]::Round((($other | Measure-Object Bytes -Sum).Sum) / 1MB, 1)
        TotalMb    = [math]::Round(((($rows | Measure-Object Bytes -Sum).Sum) / 1MB), 1)
    }
}

function Wait-Health([int]$TimeoutSec = 45) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-RestMethod -Uri 'http://127.0.0.1:47802/api/health' -TimeoutSec 2
            if ($r.status -eq 'ok') { return $r }
        } catch { Start-Sleep -Milliseconds 400 }
    }
    throw 'NexoDeck server did not become healthy on port 47802.'
}

function Close-MainWindow($Process) {
    $Process.Refresh()
    $hwnd = $Process.MainWindowHandle
    if ($hwnd -eq [IntPtr]::Zero) {
        foreach ($p in (Get-Process -Name $exeName -ErrorAction SilentlyContinue)) {
            $p.Refresh()
            if ($p.MainWindowHandle -ne [IntPtr]::Zero) { $hwnd = $p.MainWindowHandle; break }
        }
    }
    if ($hwnd -eq [IntPtr]::Zero) { throw 'Main window handle not found.' }
    [void][NexoDeck.Measure.Native]::PostMessage($hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) # WM_CLOSE
    Start-Sleep -Seconds 2
}

function Connect-Phone {
    $pairing = Invoke-RestMethod -Uri 'http://127.0.0.1:47802/api/admin/pairing' -TimeoutSec 5
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    $body = @{ code = $pairing.code; deviceName = 'measure-ram' } | ConvertTo-Json
    $pair = Invoke-RestMethod -Uri 'https://127.0.0.1:47800/api/pair' -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 10

    $ws = [System.Net.WebSockets.ClientWebSocket]::new()
    $cts = [System.Threading.CancellationTokenSource]::new(20000)
    $ws.ConnectAsync([Uri]'ws://127.0.0.1:47801/ws', $cts.Token).Wait()
    $hello = @{ v = 1; t = 'hello'; d = @{ token = $pair.token; deviceName = 'measure-ram'; clientVersion = '0.2.0' } } | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($hello)
    $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()

    # Wait for welcome so the session is registered before sampling.
    $buf = New-Object byte[] 16384
    $ms = [System.IO.MemoryStream]::new()
    do {
        $seg = [System.ArraySegment[byte]]::new($buf)
        $res = $ws.ReceiveAsync($seg, $cts.Token).Result
        $ms.Write($buf, 0, $res.Count)
    } while (-not $res.EndOfMessage)
    $welcome = [System.Text.Encoding]::UTF8.GetString($ms.ToArray()) | ConvertFrom-Json
    if ($welcome.t -ne 'welcome') { throw "Unexpected first frame: $($welcome.t)" }
    return $ws
}

function Measure-Scenario([string]$Name, [int]$RootPid) {
    $snapshots = @()
    for ($i = 0; $i -lt $Samples; $i++) {
        $snapshots += Get-Snapshot -RootPid $RootPid
        if ($i -lt $Samples - 1) { Start-Sleep -Milliseconds $IntervalMs }
    }
    $avg = [pscustomobject]@{
        Scenario  = $Name
        ServerMb  = [math]::Round((($snapshots.ServerMb | Measure-Object -Average).Average), 1)
        EdgeCount = [math]::Round((($snapshots.EdgeCount | Measure-Object -Average).Average), 0)
        EdgeMb    = [math]::Round((($snapshots.EdgeMb | Measure-Object -Average).Average), 1)
        TotalMb   = [math]::Round((($snapshots.TotalMb | Measure-Object -Average).Average), 1)
        Samples   = $Samples
    }
    Write-Host ("  {0}: server {1} MB | webview2 {2} proc / {3} MB | total {4} MB" -f $Name, $avg.ServerMb, $avg.EdgeCount, $avg.EdgeMb, $avg.TotalMb)
    return $avg
}

# --- Main --------------------------------------------------------------------
$running = Get-Process -Name $exeName -ErrorAction SilentlyContinue
if ($running) { throw "NexoDeck is already running (PID $($running[0].Id)). Close it before measuring." }

Write-Host "NexoDeck RAM measurement" -ForegroundColor Cyan
Write-Host "  exe      : $ExePath"
Write-Host "  data dir : $DataDir"
Write-Host "  samples  : $Samples x $IntervalMs ms"
Write-Host ''

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
# A window is required for scenario A, so never pass --background here.
$proc = Start-Process -FilePath $ExePath -ArgumentList @('--dev', '--data-dir', "`"$DataDir`"") -PassThru
$ws = $null
$results = @()

try {
    $health = Wait-Health
    Write-Host "Server healthy (version $($health.version)), waiting for steady state..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 4

    $wantA = $Scenario -in @('A', 'All')
    $wantB = $Scenario -in @('B', 'All')
    $wantC = $Scenario -in @('C', 'All')

    if ($wantA) {
        Write-Host 'Scenario A: panel window open'
        $results += Measure-Scenario 'A (ventana abierta)' $proc.Id
    }

    if ($wantB -or $wantC) {
        Write-Host 'Scenario B: window closed (tray)'
        Close-MainWindow $proc
        Start-Sleep -Seconds 3
        if ($wantB) { $results += Measure-Scenario 'B (ventana cerrada)' $proc.Id }
    }

    if ($wantC) {
        Write-Host 'Scenario C: window closed + paired phone connected'
        $ws = Connect-Phone
        Start-Sleep -Seconds 3
        $results += Measure-Scenario 'C (cerrada + celular)' $proc.Id
    }

    $title = if ($Label) { $Label } else { 'Medición' }
    Write-Host ''
    Write-Host "### $title" -ForegroundColor Green
    Write-Host ''
    Write-Host '| Escenario | nexodeck.server (MB) | msedgewebview2 (procesos) | msedgewebview2 (MB) | Total (MB) |'
    Write-Host '|---|---:|---:|---:|---:|'
    foreach ($r in $results) {
        Write-Host ("| {0} | {1} | {2} | {3} | {4} |" -f $r.Scenario, $r.ServerMb, $r.EdgeCount, $r.EdgeMb, $r.TotalMb)
    }
}
finally {
    if ($ws) { try { $ws.Dispose() } catch { } }
    if ($proc -and -not $proc.HasExited) {
        Write-Host "`nStopping NexoDeck (PID $($proc.Id))..."
        try { $proc.CloseMainWindow() | Out-Null } catch { }
        Start-Sleep -Seconds 2
        if (-not $proc.HasExited) { $proc.Kill(); $proc.WaitForExit() }
    }
}
