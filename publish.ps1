#requires -Version 5.1
<#
.SYNOPSIS
    Atlas 배포 스크립트 — WebService + DesktopApp을 publish/ 폴더에 빌드하고 zip 생성.
.EXAMPLE
    .\publish.ps1
    .\publish.ps1 -SkipZip
#>
param(
    [switch]$SkipZip
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$publishDir = Join-Path $root 'publish'

Write-Host "==> 기존 publish 폴더 정리" -ForegroundColor Cyan
if (Test-Path $publishDir) {
    Remove-Item $publishDir -Recurse -Force
}

Write-Host "==> WebService publish (프론트엔드 자동 빌드 포함)" -ForegroundColor Cyan
dotnet publish (Join-Path $root 'src/ProjectManager.WebService/ProjectManager.WebService.csproj') -p:PublishProfile=Release
if ($LASTEXITCODE -ne 0) { throw "WebService publish 실패" }

Write-Host "==> DesktopApp publish" -ForegroundColor Cyan
dotnet publish (Join-Path $root 'src/ProjectManager.DesktopApp/ProjectManager.DesktopApp.csproj') -p:PublishProfile=Release
if ($LASTEXITCODE -ne 0) { throw "DesktopApp publish 실패" }

Write-Host "==> 결과 확인" -ForegroundColor Cyan
$desktop = Join-Path $publishDir 'Atlas.exe'
$web     = Join-Path $publishDir 'ProjectManager.WebService.exe'
$www     = Join-Path $publishDir 'wwwroot/index.html'
foreach ($f in @($desktop, $web, $www)) {
    if (-not (Test-Path $f)) { throw "필수 파일 누락: $f" }
}
Write-Host "  - Atlas.exe       : OK" -ForegroundColor Green
Write-Host "  - WebService.exe  : OK" -ForegroundColor Green
Write-Host "  - wwwroot/index   : OK" -ForegroundColor Green

if (-not $SkipZip) {
    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $zipPath = Join-Path $root "Atlas-$stamp.zip"
    Write-Host "==> 압축 생성: $zipPath" -ForegroundColor Cyan
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Compress-Archive -Path (Join-Path $publishDir '*') -DestinationPath $zipPath
    Write-Host "완료. $zipPath 파일을 전달하세요." -ForegroundColor Green
} else {
    Write-Host "완료. publish/ 폴더 내용을 압축하여 전달하세요." -ForegroundColor Green
}
