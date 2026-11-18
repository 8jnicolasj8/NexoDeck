$ErrorActionPreference = "Stop"

$repoRoot = (Get-Item $PSScriptRoot).Parent.FullName
Set-Location $repoRoot

$distDir = Join-Path $repoRoot "dist"
New-Item -ItemType Directory -Force -Path $distDir | Out-Null

# La versión sale del csproj para que el zip, el instalador y el panel no se desincronicen.
$versionMatch = Select-String -Path (Join-Path $repoRoot "server\src\OpenDeck.Server\OpenDeck.Server.csproj") -Pattern '<Version>([^<]+)</Version>'
if (-not $versionMatch) { throw "No se pudo leer <Version> del csproj." }
$appVersion = $versionMatch.Matches[0].Groups[1].Value

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host " OpenDeck Build & Package Script" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# 1. Build Web PWA Frontend
Write-Host "`n1. Building Web PWA Client (Vite)..." -ForegroundColor Yellow
npm --prefix web run build
if ($LASTEXITCODE -ne 0) { throw "Web build failed." }

# 2. Publish .NET Desktop Server
Write-Host "`n2. Publishing .NET Server (Release win-x64, self-contained)..." -ForegroundColor Yellow
dotnet publish server/src/OpenDeck.Server/OpenDeck.Server.csproj -c Release -r win-x64 --self-contained true
if ($LASTEXITCODE -ne 0) { throw "Dotnet publish failed." }

$publishDir = Join-Path $repoRoot "server\src\OpenDeck.Server\bin\Release\net8.0-windows10.0.19041.0\win-x64\publish"

# 3. Create Portable Zip
Write-Host "`n3. Creating Portable Package..." -ForegroundColor Yellow
$portableDir = Join-Path $repoRoot "dist\OpenDeck-portable"
if (Test-Path $portableDir) { Remove-Item -Recurse -Force $portableDir }
New-Item -ItemType Directory -Force -Path $portableDir | Out-Null

Copy-Item -Path "$publishDir\*" -Destination $portableDir -Recurse
New-Item -ItemType File -Force -Path (Join-Path $portableDir "portable.flag") | Out-Null

$portableZip = Join-Path $distDir "OpenDeck-$appVersion-portable.zip"
if (Test-Path $portableZip) { Remove-Item -Force $portableZip }
Compress-Archive -Path "$portableDir\*" -DestinationPath $portableZip -CompressionLevel Optimal
Remove-Item -Recurse -Force $portableDir
Write-Host "  -> Portable ZIP created: $portableZip" -ForegroundColor Green

# 4. Compile Installer with Inno Setup
Write-Host "`n4. Compiling Installer with Inno Setup..." -ForegroundColor Yellow

$isccCandidates = @(
    "iscc",
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe"
)

$isccPath = $null
foreach ($candidate in $isccCandidates) {
    if (Get-Command $candidate -ErrorAction SilentlyContinue) {
        $isccPath = $candidate
        break
    }
    if (Test-Path $candidate) {
        $isccPath = $candidate
        break
    }
}

if ($isccPath) {
    Write-Host "  -> Found Inno Setup Compiler at: $isccPath"
    $issFile = Join-Path $repoRoot "installer\OpenDeck.iss"
    & $isccPath $issFile
    if ($LASTEXITCODE -ne 0) { throw "Inno Setup compilation failed." }
    Write-Host "  -> Installer generated successfully in: $distDir" -ForegroundColor Green
} else {
    Write-Warning "Inno Setup compiler (ISCC.exe) not found. Installer generation skipped."
}

Write-Host "`n=============================================" -ForegroundColor Green
Write-Host " BUILD & PACKAGING COMPLETE!" -ForegroundColor Green
Write-Host " Artifacts in: $distDir" -ForegroundColor Green
Get-ChildItem $distDir | Select-Object Name, Length, LastWriteTime
Write-Host "=============================================" -ForegroundColor Green
