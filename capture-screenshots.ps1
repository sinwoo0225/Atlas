#requires -Version 5.1
<#
.SYNOPSIS
    Store/README screenshot capture orchestrator.
    Boots backend (:5200) + Vite (:5173) against an ISOLATED temp data folder, seeds sample
    data, then runs Playwright (scripts/capture-screenshots.mjs) to capture ko + en screens.

    Safety: the user's real data folder (dataFolder in %LOCALAPPDATA%\Atlas\config.json) is
    NOT touched. config.json is backed up -> repointed at a temp folder -> ALWAYS restored
    (finally). The temp DB is deleted afterward.

    Prereqs: frontend deps + Playwright chromium (cd frontend; npm i; npx playwright install chromium).
.EXAMPLE
    .\capture-screenshots.ps1
#>
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

$configPath    = Join-Path $env:LOCALAPPDATA 'Atlas\config.json'
$backupPath    = "$configPath.screenshot-bak"
$tempData      = Join-Path $env:TEMP ('atlas-shots-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$koOut         = Join-Path $root 'screenshots'
$enOut         = Join-Path $root 'store/screenshots-en'
$configExisted = Test-Path $configPath
$backendId     = $null
$viteId        = $null

function Wait-Url($url, $timeoutSec, $label) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $timeoutSec) {
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $true }
        } catch { Start-Sleep -Milliseconds 700 }
    }
    throw "$label did not come up within ${timeoutSec}s: $url"
}

function Test-PortFree($port) {
    # Connection refused => free. Any HTTP response => in use.
    try { Invoke-WebRequest -Uri "http://localhost:$port" -UseBasicParsing -TimeoutSec 2 | Out-Null; return $false }
    catch { return ($null -eq $_.Exception.Response) }
}

# Port conflict pre-check: a running Atlas/dev would risk seeding into its real data.
foreach ($p in @(5200, 5173)) {
    if (-not (Test-PortFree $p)) {
        throw "Port $p is already in use. Stop any running Atlas dev / backend / Vite and retry."
    }
}

try {
    Write-Host "==> Backup config + temp data folder ($tempData)" -ForegroundColor Cyan
    if ($configExisted) { Copy-Item $configPath $backupPath -Force }
    New-Item -ItemType Directory -Force $tempData | Out-Null
    New-Item -ItemType Directory -Force (Split-Path $configPath) | Out-Null
    # Write BOM-less UTF-8 (safe for System.Text.Json).
    $cfgJson = (@{ dataFolder = $tempData } | ConvertTo-Json -Compress)
    [System.IO.File]::WriteAllText($configPath, $cfgJson, (New-Object System.Text.UTF8Encoding($false)))

    Write-Host "==> Start backend (:5200)" -ForegroundColor Cyan
    $backend = Start-Process -FilePath 'dotnet' `
        -ArgumentList @('run', '--project', (Join-Path $root 'src/ProjectManager.WebService'), '-c', 'Release') `
        -PassThru -WindowStyle Hidden
    $backendId = $backend.Id
    Wait-Url 'http://localhost:5200/api/system/ping' 180 'backend'
    Write-Host "  - backend OK" -ForegroundColor Green

    Write-Host "==> Seed sample data" -ForegroundColor Cyan
    & (Join-Path $root 'seed-sample-data.ps1')

    Write-Host "==> Start Vite dev (:5173)" -ForegroundColor Cyan
    $vite = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', 'npm run dev') `
        -WorkingDirectory (Join-Path $root 'frontend') -PassThru -WindowStyle Hidden
    $viteId = $vite.Id
    Wait-Url 'http://localhost:5173' 60 'Vite'
    Write-Host "  - Vite OK" -ForegroundColor Green

    Write-Host "==> Capture (ko -> screenshots/, en -> store/screenshots-en/)" -ForegroundColor Cyan
    Push-Location (Join-Path $root 'frontend')
    try {
        & node 'scripts/capture-screenshots.mjs' '--lang' 'ko' '--base' 'http://localhost:5173' '--out' $koOut
        if ($LASTEXITCODE -ne 0) { throw "ko capture failed" }
        & node 'scripts/capture-screenshots.mjs' '--lang' 'en' '--base' 'http://localhost:5173' '--out' $enOut
        if ($LASTEXITCODE -ne 0) { throw "en capture failed" }
    } finally { Pop-Location }

    Write-Host "Done. screenshots/ (ko) + store/screenshots-en/ (en) generated." -ForegroundColor Green
}
finally {
    Write-Host "==> Cleanup (stop processes + restore config + delete temp)" -ForegroundColor Cyan
    foreach ($id in @($viteId, $backendId)) {
        if ($id) { & taskkill /PID $id /T /F 2>$null | Out-Null }
    }
    if ($configExisted) {
        Copy-Item $backupPath $configPath -Force
        Remove-Item $backupPath -Force -ErrorAction SilentlyContinue
    } elseif (Test-Path $configPath) {
        Remove-Item $configPath -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path $tempData) { Remove-Item $tempData -Recurse -Force -ErrorAction SilentlyContinue }
    Write-Host "  - config restored / temp data deleted" -ForegroundColor Green
}
