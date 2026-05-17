#requires -Version 5.1
<#
.SYNOPSIS
    Atlas 배포 스크립트.
    - 기본: DesktopApp 단일 in-process exe (Atlas.exe + wwwroot) 를 publish/ 폴더에 빌드하고 zip 생성.
    - -Server: ProjectManager.WebService 를 standalone Atlas-Server.exe 로 publish/server/ 에 빌드하고 별도 zip 생성.
      (Client 모드 클라이언트들이 붙는 원격 서버. wwwroot 는 클라가 자체 보유하므로 서버에는 미포함.)
    - -Version <ver>: zip 이름의 stamp 대신 명시한 버전을 사용. 릴리즈 자산용.
.EXAMPLE
    .\publish.ps1                       # Atlas-YYYYMMDD_HHMMSS.zip
    .\publish.ps1 -Version 1.4.0        # Atlas-1.4.0.zip
    .\publish.ps1 -Server -Version 1.4.0  # Atlas-Server-1.4.0.zip
    .\publish.ps1 -SkipZip              # zip 생략
#>
param(
    [switch]$SkipZip,
    [switch]$Server,
    [string]$Version
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

if ($Server) {
    $publishDir = Join-Path $root 'publish/server'

    Write-Host "==> 기존 publish/server 폴더 정리" -ForegroundColor Cyan
    if (Test-Path $publishDir) {
        Remove-Item $publishDir -Recurse -Force
    }

    Write-Host "==> WebService publish (standalone Kestrel 서버)" -ForegroundColor Cyan
    # AssemblyName 을 cmd-line 으로 바꾸면 NuGet restore 에서 'Ambiguous project name' 발생.
    # 기본 산출물명(ProjectManager.WebService.exe) 으로 publish 한 뒤 Atlas-Server.exe 로 이름만 바꾼다.
    dotnet publish (Join-Path $root 'src/ProjectManager.WebService/ProjectManager.WebService.csproj') `
        -c Release -r win-x64 --self-contained `
        -p:PublishSingleFile=true `
        -p:IncludeNativeLibrariesForSelfExtract=true `
        -o $publishDir
    if ($LASTEXITCODE -ne 0) { throw "WebService publish 실패" }

    $sourceExe = Join-Path $publishDir 'ProjectManager.WebService.exe'
    $targetExe = Join-Path $publishDir 'Atlas-Server.exe'
    if (Test-Path $sourceExe) {
        if (Test-Path $targetExe) { Remove-Item $targetExe -Force }
        Rename-Item -Path $sourceExe -NewName 'Atlas-Server.exe'
    }
    # 같은 베이스 이름의 .pdb 도 같이 변경 (DebugType=None 이면 없을 수도 있음).
    $sourcePdb = Join-Path $publishDir 'ProjectManager.WebService.pdb'
    if (Test-Path $sourcePdb) {
        $targetPdb = Join-Path $publishDir 'Atlas-Server.pdb'
        if (Test-Path $targetPdb) { Remove-Item $targetPdb -Force }
        Rename-Item -Path $sourcePdb -NewName 'Atlas-Server.pdb'
    }

    # 서버용 README (운영자 안내) 와 run-server.cmd 헬퍼 생성.
    $readmePath = Join-Path $publishDir 'README-SERVER.txt'
    @'
Atlas-Server — 사내 LAN 원격 서버
================================

실행:
  set ATLAS_SERVER=1
  set ATLAS_API_KEY=공유시크릿문자열
  set ASPNETCORE_URLS=http://0.0.0.0:5200
  Atlas-Server.exe

데이터 폴더:
  서버 머신의 %LOCALAPPDATA%\Atlas\config.json 의 dataFolder 필드를 편집해 변경.
  기본값은 %USERPROFILE%\Documents\ProjectManager\.

방화벽:
  5200 포트의 인바운드 허용 (사내 LAN 만).

클라이언트 측 설정:
  Atlas.exe → 설정 → 연결 방식 → Client → URL 과 API 키 입력 → 저장 → 재시작.

업그레이드:
  서버 정지 → Atlas-Server.exe 와 동봉 파일 교체 → 재실행.
  DB 마이그레이션은 시작 시 자동.
'@ | Out-File -FilePath $readmePath -Encoding utf8

    $runCmdPath = Join-Path $publishDir 'run-server.cmd'
    @'
@echo off
REM 사용 전 ATLAS_API_KEY 를 실제 시크릿으로 교체.
set ATLAS_SERVER=1
set ATLAS_API_KEY=change-me-please
set ASPNETCORE_URLS=http://0.0.0.0:5200
Atlas-Server.exe
'@ | Out-File -FilePath $runCmdPath -Encoding ascii

    Write-Host "==> 결과 확인" -ForegroundColor Cyan
    $serverExe = Join-Path $publishDir 'Atlas-Server.exe'
    if (-not (Test-Path $serverExe)) { throw "필수 파일 누락: $serverExe" }
    Write-Host "  - Atlas-Server.exe : OK" -ForegroundColor Green
    Write-Host "  - README-SERVER    : OK" -ForegroundColor Green
    Write-Host "  - run-server.cmd   : OK" -ForegroundColor Green

    if (-not $SkipZip) {
        $tag = if ($Version) { $Version } else { Get-Date -Format 'yyyyMMdd_HHmmss' }
        $zipPath = Join-Path $root "Atlas-Server-$tag.zip"
        Write-Host "==> 압축 생성: $zipPath" -ForegroundColor Cyan
        if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
        Compress-Archive -Path (Join-Path $publishDir '*') -DestinationPath $zipPath
        Write-Host "완료. $zipPath 파일을 서버 운영자에게 전달하세요." -ForegroundColor Green
    } else {
        Write-Host "완료. publish/server/ 폴더 내용을 압축하여 전달하세요." -ForegroundColor Green
    }
    return
}

# -------- DesktopApp (기본) --------
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

# CLI 동봉 — Claude Code 등 외부 자동화에서 같은 데이터 폴더에 쓰기 가능 (사이클 6).
# AssemblyName=Atlas-Cli 라 산출물명은 자동으로 Atlas-Cli.exe. Atlas.exe 와 같은 publish/ 폴더에 둠.
Write-Host "==> Atlas-Cli publish (단일 파일, 외부 자동화 진입점)" -ForegroundColor Cyan
dotnet publish (Join-Path $root 'src/ProjectManager.Cli/ProjectManager.Cli.csproj') `
    -c Release -r win-x64 --self-contained `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -o $publishDir
if ($LASTEXITCODE -ne 0) { throw "Atlas-Cli publish 실패" }
$cli = Join-Path $publishDir 'Atlas-Cli.exe'
if (-not (Test-Path $cli)) { throw "필수 파일 누락: $cli" }
Write-Host "  - Atlas-Cli.exe   : OK" -ForegroundColor Green

# MCP 서버 동봉 — Claude Code .mcp.json 등록 1줄로 자연어 → 도구 콜 (사이클 7).
Write-Host "==> Atlas-Mcp publish (단일 파일, stdio MCP 서버)" -ForegroundColor Cyan
dotnet publish (Join-Path $root 'src/ProjectManager.Mcp/ProjectManager.Mcp.csproj') `
    -c Release -r win-x64 --self-contained `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -o $publishDir
if ($LASTEXITCODE -ne 0) { throw "Atlas-Mcp publish 실패" }
$mcp = Join-Path $publishDir 'Atlas-Mcp.exe'
if (-not (Test-Path $mcp)) { throw "필수 파일 누락: $mcp" }
Write-Host "  - Atlas-Mcp.exe   : OK" -ForegroundColor Green

# 외부 자동화용 사용법 매뉴얼을 publish 폴더에도 동봉 — 배포 zip 만 받은 사용자도 발견 용이.
$usage = Join-Path $root 'ATLAS-CLI-USAGE.md'
if (Test-Path $usage) {
    Copy-Item $usage -Destination (Join-Path $publishDir 'ATLAS-CLI-USAGE.md') -Force
    Write-Host "  - ATLAS-CLI-USAGE : OK" -ForegroundColor Green
}

if (-not $SkipZip) {
    $tag = if ($Version) { $Version } else { Get-Date -Format 'yyyyMMdd_HHmmss' }
    $zipPath = Join-Path $root "Atlas-$tag.zip"
    Write-Host "==> 압축 생성: $zipPath" -ForegroundColor Cyan
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Compress-Archive -Path (Join-Path $publishDir '*') -DestinationPath $zipPath
    Write-Host "완료. $zipPath 파일을 전달하세요." -ForegroundColor Green
} else {
    Write-Host "완료. publish/ 폴더 내용을 압축하여 전달하세요." -ForegroundColor Green
}
