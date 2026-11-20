$ErrorActionPreference = "Continue"
$publishDir = "D:\Archivos\Proyectos_personales\VexaDeck\server\src\VexaDeck.Server\bin\Release\net8.0-windows10.0.19041.0\win-x64\publish"
$dll = Join-Path $publishDir "Microsoft.Web.WebView2.Core.dll"
[System.Reflection.Assembly]::LoadFrom($dll) | Out-Null

try {
    $temp = Join-Path $env:TEMP "wv2_test"
    $task = [Microsoft.Web.WebView2.Core.CoreWebView2Environment]::CreateAsync($null, $temp, $null)
    $env = $task.GetAwaiter().GetResult()
    Write-Host "SUCCESS: BrowserVersion = $($env.BrowserVersionString)"
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    if ($_.Exception.InnerException) {
        Write-Host "INNER: $($_.Exception.InnerException.Message)"
    }
}
