#requires -Version 5.1
<#
.SYNOPSIS
    Atlas 배포 스크립트 — DesktopApp 단일 in-process exe 를 publish/ 폴더에 빌드하고 zip 생성.
    WebService 는 더 이상 별도 exe 로 배포되지 않으며, AppHost 라이브러리가 Atlas.exe 안에서 직접 호스팅된다.
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

Write-Host "==> DesktopApp publish (프론트엔드 자동 빌드 + in-process AppHost 포함)" -ForegroundColor Cyan
dotnet publish (Join-Path $root 'src/ProjectManager.DesktopApp/ProjectManager.DesktopApp.csproj') -c Release
if ($LASTEXITCODE -ne 0) { throw "DesktopApp publish 실패" }

Write-Host "==> 결과 확인" -ForegroundColor Cyan
$desktop = Join-Path $publishDir 'Atlas.exe'
$www     = Join-Path $publishDir 'wwwroot/index.html'
foreach ($f in @($desktop, $www)) {
    if (-not (Test-Path $f)) { throw "필수 파일 누락: $f" }
}
Write-Host "  - Atlas.exe       : OK" -ForegroundColor Green
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
