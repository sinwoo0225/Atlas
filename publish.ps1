#requires -Version 5.1
<#
.SYNOPSIS
    Atlas 배포 스크립트.
    - 기본: DesktopApp 단일 in-process exe (Atlas.exe + wwwroot) 를 publish/ 폴더에 빌드하고 zip 생성.
    - -Server: ProjectManager.WebService 를 standalone Atlas-Server.exe 로 publish/server/ 에 빌드하고 별도 zip 생성.
      (Client 모드 클라이언트들이 붙는 원격 서버. wwwroot 는 클라가 자체 보유하므로 서버에는 미포함.)
    - -Version <ver>: zip 이름의 stamp 대신 명시한 버전을 사용. 릴리즈 자산용.
    - -Installer: Inno Setup(ISCC) 으로 per-user 설치형 Atlas-Setup-<버전>.exe 도 생성 (DesktopApp 모드).
    - -Msix: Microsoft Store 용 MSIX 패키지(Atlas-<버전>.msix) 생성. Atlas.exe + wwwroot + Atlas-Cli.exe + Atlas-Mcp.exe 동봉 (CLI/MCP 는 App Execution Alias atlas-cli·atlas-mcp 로 노출).
      매니페스트는 installer/msix/AppxManifest.xml 템플릿을 치환. 제출 전 -Publisher/-IdentityName 을 Partner Center 값으로 지정.
      -SelfSign 은 로컬 사이드로드 테스트용 자체서명(스토어 업로드본은 MS 가 서명). makeappx/signtool 은 Windows SDK 필요.
.EXAMPLE
    .\publish.ps1                          # Atlas-YYYYMMDD_HHMMSS.zip
    .\publish.ps1 -Version 1.4.0           # Atlas-1.4.0.zip
    .\publish.ps1 -Version 1.5.0 -Installer  # Atlas-1.5.0.zip + Atlas-Setup-1.5.0.exe
    .\publish.ps1 -Server -Version 1.4.0   # Atlas-Server-1.4.0.zip
    .\publish.ps1 -Msix -Version 1.22.0.0 -SelfSign  # Atlas-1.22.0.0.msix (로컬 테스트 서명)
    .\publish.ps1 -SkipZip                 # zip 생략
#>
param(
    [switch]$SkipZip,
    [switch]$Server,
    [string]$Version,
    [switch]$Installer,
    # MSIX (Microsoft Store) 패키지 빌드. Atlas.exe + wwwroot + Atlas-Cli.exe + Atlas-Mcp.exe (CLI/MCP 는 App Execution Alias 로 노출).
    [switch]$Msix,
    [switch]$SelfSign,                 # 로컬 사이드로드 테스트용 자체서명 (스토어 업로드본은 MS 가 서명).
    [string]$Publisher,                # 매니페스트 Identity/Publisher (예: 'CN=ABCD1234-...'). 미지정 시 테스트값.
    [string]$PublisherDisplay,         # 게시자 표시 이름.
    [string]$IdentityName,             # Partner Center 발급 Package Name. 미지정 시 테스트값.
    [string]$DisplayName,              # 스토어/시작 메뉴 표시 이름.
    [string]$MsixLogoSource            # 타일 로고 소스 PNG. 미지정 시 atlas-v2-monogram.png.
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

# 배포 산출물(zip·msix·Setup.exe)은 전부 dist/ 로. 예전엔 레포 루트에 쏟아져서 수백 MB 가 쌓였다.
# gitignore 의 **/dist/ 가 커버한다.
$distDir = Join-Path $root 'dist'
function Ensure-Dist {
    if (-not (Test-Path $distDir)) { New-Item -ItemType Directory -Path $distDir | Out-Null }
}

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
        Ensure-Dist
        $zipPath = Join-Path $distDir "Atlas-Server-$tag.zip"
        Write-Host "==> 압축 생성: $zipPath" -ForegroundColor Cyan
        if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
        Compress-Archive -Path (Join-Path $publishDir '*') -DestinationPath $zipPath
        Write-Host "완료. $zipPath 파일을 서버 운영자에게 전달하세요." -ForegroundColor Green
    } else {
        Write-Host "완료. publish/server/ 폴더 내용을 압축하여 전달하세요." -ForegroundColor Green
    }
    return
}

# -------- MSIX (Microsoft Store) --------
if ($Msix) {
    function Find-WindowsSdkTool($exe) {
        $cmd = Get-Command $exe -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
        $bases = @(
            (Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'),
            (Join-Path $env:ProgramFiles 'Windows Kits\10\bin')
        )
        foreach ($b in $bases) {
            if (Test-Path $b) {
                $found = Get-ChildItem -Path $b -Recurse -Filter $exe -ErrorAction SilentlyContinue |
                    Where-Object { $_.FullName -match '\\x64\\' } |
                    Sort-Object FullName -Descending | Select-Object -First 1
                if ($found) { return $found.FullName }
            }
        }
        return $null
    }

    Write-Host "==> MSIX 패키지 빌드" -ForegroundColor Cyan

    # 버전: -Version 우선, 없으면 Directory.Build.props 의 <Version>. 4파트로 정규화 (1.22.0 -> 1.22.0.0).
    $verRaw = if ($Version) { $Version } else {
        $bp = Join-Path $root 'Directory.Build.props'
        $m = Select-String -Path $bp -Pattern '<Version>([^<]+)</Version>' | Select-Object -First 1
        if ($m) { $m.Matches[0].Groups[1].Value.Trim() } else { '0.0.0' }
    }
    $parts = @($verRaw.Split('.'))
    while ($parts.Count -lt 4) { $parts += '0' }
    $ver4 = ($parts[0..3] -join '.')

    # Partner Center 등록값 (공개 정보 — 커밋 가능). 필요 시 -Publisher/-IdentityName/-DisplayName 로 오버라이드.
    # DisplayName 은 예약한 표시 이름과 100% 일치해야 스토어 인증을 통과한다.
    $identityName  = if ($IdentityName)     { $IdentityName }     else { 'SlnU.Atlas-ProjectManager' }
    $publisher     = if ($Publisher)        { $Publisher }        else { 'CN=1398342C-A2D7-4B4A-BFE2-34D8CCFD7FBA' }
    $publisherDisp = if ($PublisherDisplay) { $PublisherDisplay } else { 'SlnU' }
    $displayName   = if ($DisplayName)      { $DisplayName }      else { 'Atlas-Project Manager' }
    $logoSource    = if ($MsixLogoSource)   { $MsixLogoSource }   else { Join-Path $root 'frontend/public/icons/atlas-v2-monogram.png' }

    $stage = Join-Path $root 'publish/msix-stage'
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }

    # 1) DesktopApp publish — 단일파일 OFF. 패키지는 폴더 레이아웃이라 Atlas.exe 옆 wwwroot 가 그대로 해석된다.
    Write-Host "==> DesktopApp publish (non-single-file, self-contained → $stage)" -ForegroundColor Cyan
    dotnet publish (Join-Path $root 'src/ProjectManager.DesktopApp/ProjectManager.DesktopApp.csproj') `
        -c Release -r win-x64 --self-contained `
        -p:PublishSingleFile=false `
        -p:IncludeNativeLibrariesForSelfExtract=false `
        -p:EnableCompressionInSingleFile=false `
        -o $stage
    if ($LASTEXITCODE -ne 0) { throw "DesktopApp publish 실패" }

    # CLI/MCP 도 같은 패키지에 동봉 — App Execution Alias(atlas-cli·atlas-mcp)로 터미널에 노출(매니페스트 Extensions).
    # non-single-file self-contained 라 DesktopApp 가 이미 stage 에 둔 .NET 런타임 DLL 을 공유(동일 파일 덮어쓰기) → 패키지 비대화 방지.
    Write-Host "==> Atlas-Cli / Atlas-Mcp publish (non-single-file, self-contained → $stage)" -ForegroundColor Cyan
    dotnet publish (Join-Path $root 'src/ProjectManager.Cli/ProjectManager.Cli.csproj') `
        -c Release -r win-x64 --self-contained -p:PublishSingleFile=false -o $stage
    if ($LASTEXITCODE -ne 0) { throw "Atlas-Cli publish 실패 (MSIX stage)" }
    dotnet publish (Join-Path $root 'src/ProjectManager.Mcp/ProjectManager.Mcp.csproj') `
        -c Release -r win-x64 --self-contained -p:PublishSingleFile=false -o $stage
    if ($LASTEXITCODE -ne 0) { throw "Atlas-Mcp publish 실패 (MSIX stage)" }

    $stageExe = Join-Path $stage 'Atlas.exe'
    $stageWww = Join-Path $stage 'wwwroot/index.html'
    $stageCli = Join-Path $stage 'Atlas-Cli.exe'
    $stageMcp = Join-Path $stage 'Atlas-Mcp.exe'
    foreach ($f in @($stageExe, $stageWww, $stageCli, $stageMcp)) { if (-not (Test-Path $f)) { throw "필수 파일 누락: $f" } }
    Write-Host "  - Atlas.exe / wwwroot / Atlas-Cli.exe / Atlas-Mcp.exe : OK" -ForegroundColor Green

    # Claude Code 스킬 + 커맨드 + CLI 문서 동봉 — atlas-cli skill install 이 패키지 루트의 skills/atlas·commands 를 ~/.claude 로 복사.
    foreach ($d in @('skills', 'cli-docs', 'commands')) {
        $srcDir = Join-Path $root $d
        if (Test-Path $srcDir) {
            Copy-Item $srcDir -Destination (Join-Path $stage $d) -Recurse -Force
            Write-Host "  - $d (동봉)          : OK" -ForegroundColor Green
        }
    }

    # 2) 로고 자산 생성 (256px 소스 → MSIX 필수 PNG 세트). 종횡비 유지, 투명 캔버스 중앙 배치.
    Write-Host "==> 로고 자산 생성 ($logoSource)" -ForegroundColor Cyan
    if (-not (Test-Path $logoSource)) { throw "로고 소스를 찾을 수 없습니다: $logoSource" }
    $assets = Join-Path $stage 'Assets'
    New-Item -ItemType Directory -Force $assets | Out-Null
    Add-Type -AssemblyName System.Drawing
    $srcImg = [System.Drawing.Image]::FromFile($logoSource)
    try {
        foreach ($spec in @(@(44,44,'Square44x44Logo.png'), @(150,150,'Square150x150Logo.png'), @(310,150,'Wide310x150Logo.png'), @(50,50,'StoreLogo.png'))) {
            $w = $spec[0]; $h = $spec[1]; $name = $spec[2]
            $bmp = New-Object System.Drawing.Bitmap($w, $h)
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.Clear([System.Drawing.Color]::Transparent)
            $side = [Math]::Min($w, $h)
            $ratio = [Math]::Min($side / $srcImg.Width, $side / $srcImg.Height)
            $dw = [int]($srcImg.Width * $ratio); $dh = [int]($srcImg.Height * $ratio)
            $g.DrawImage($srcImg, [int](($w - $dw) / 2), [int](($h - $dh) / 2), $dw, $dh)
            $g.Dispose()
            $bmp.Save((Join-Path $assets $name), [System.Drawing.Imaging.ImageFormat]::Png)
            $bmp.Dispose()
        }
    } finally { $srcImg.Dispose() }
    Write-Host "  - Assets (4 PNG)      : OK" -ForegroundColor Green

    # 3) 매니페스트 토큰 치환 (.Replace = 양쪽 리터럴, regex/$ 함정 회피).
    Write-Host "==> AppxManifest 생성 (Identity=$identityName, v$ver4)" -ForegroundColor Cyan
    $tpl = Get-Content (Join-Path $root 'installer/msix/AppxManifest.xml') -Raw -Encoding UTF8
    # 메인테이너용 설명 주석은 패키지에 싣지 않는다 (토큰 설명이 치환돼 지저분해지는 것도 방지).
    $tpl = [System.Text.RegularExpressions.Regex]::Replace($tpl, '<!--.*?-->', '', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    $manifest = $tpl.Replace('__IDENTITY_NAME__', $identityName).Replace('__PUBLISHER__', $publisher).Replace('__PUBLISHER_DISPLAY__', $publisherDisp).Replace('__DISPLAY_NAME__', $displayName).Replace('__VERSION__', $ver4)
    $manifest = $manifest.Trim()
    [System.IO.File]::WriteAllText((Join-Path $stage 'AppxManifest.xml'), $manifest, (New-Object System.Text.UTF8Encoding($false)))

    # 4) makeappx pack.
    $makeappx = Find-WindowsSdkTool 'makeappx.exe'
    if (-not $makeappx) {
        Write-Warning "makeappx.exe(Windows SDK) 를 찾을 수 없습니다. Windows SDK 설치 후 다시 실행하세요. (스테이징은 $stage 에 준비됨)"
        return
    }
    Ensure-Dist
    $msixOut = Join-Path $distDir "Atlas-$ver4.msix"
    if (Test-Path $msixOut) { Remove-Item $msixOut -Force }
    & $makeappx pack /d $stage /p $msixOut /o
    if ($LASTEXITCODE -ne 0) { throw "makeappx pack 실패 (exit $LASTEXITCODE)" }
    Write-Host "완료. $msixOut 생성됨." -ForegroundColor Green

    # 5) -SelfSign: 로컬 사이드로드 테스트용 자체서명 (스토어 업로드본은 서명 불필요 — MS 가 서명).
    if ($SelfSign) {
        $signtool = Find-WindowsSdkTool 'signtool.exe'
        if (-not $signtool) { Write-Warning "signtool.exe 를 찾을 수 없어 서명을 생략합니다."; return }
        Write-Host "==> 자체서명 (테스트 전용)" -ForegroundColor Cyan
        $cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq $publisher } | Select-Object -First 1
        if (-not $cert) {
            $cert = New-SelfSignedCertificate -Type Custom -Subject $publisher `
                -KeyUsage DigitalSignature -FriendlyName 'Atlas MSIX Test' `
                -CertStoreLocation 'Cert:\CurrentUser\My' `
                -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
        }
        & $signtool sign /fd SHA256 /sha1 $cert.Thumbprint $msixOut
        if ($LASTEXITCODE -ne 0) { throw "signtool 서명 실패 (exit $LASTEXITCODE)" }
        Write-Host "서명 완료. 로컬 설치 전 인증서를 신뢰 저장소에 추가:" -ForegroundColor Yellow
        Write-Host "  Export-Certificate -Cert Cert:\CurrentUser\My\$($cert.Thumbprint) -FilePath dist\atlas-test.cer" -ForegroundColor DarkGray
        Write-Host "  (관리자) Import-Certificate -FilePath dist\atlas-test.cer -CertStoreLocation Cert:\LocalMachine\TrustedPeople" -ForegroundColor DarkGray
        Write-Host "  그 후: Add-AppxPackage $msixOut" -ForegroundColor DarkGray
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

# Claude Code 스킬 + 커맨드 + CLI 문서 동봉 — atlas-cli skill install 이 publish 옆 skills/atlas·commands 를 ~/.claude 로 복사.
foreach ($d in @('skills', 'cli-docs', 'commands')) {
    $srcDir = Join-Path $root $d
    if (Test-Path $srcDir) {
        Copy-Item $srcDir -Destination (Join-Path $publishDir $d) -Recurse -Force
        Write-Host "  - $d (동봉)       : OK" -ForegroundColor Green
    }
}

$tag = if ($Version) { $Version } else { Get-Date -Format 'yyyyMMdd_HHmmss' }

if (-not $SkipZip) {
    Ensure-Dist
    $zipPath = Join-Path $distDir "Atlas-$tag.zip"
    Write-Host "==> 압축 생성: $zipPath" -ForegroundColor Cyan
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Compress-Archive -Path (Join-Path $publishDir '*') -DestinationPath $zipPath
    Write-Host "완료. $zipPath 파일을 전달하세요." -ForegroundColor Green
} else {
    Write-Host "완료. publish/ 폴더 내용을 압축하여 전달하세요." -ForegroundColor Green
}

# -Installer: Inno Setup(ISCC) 으로 per-user 설치형 Atlas-Setup-<버전>.exe 생성.
# ISCC 미설치 시 빌드 실패가 아니라 경고만 (포터블 zip 은 이미 생성됨).
if ($Installer) {
    Write-Host "==> 인스톨러 생성 (Inno Setup)" -ForegroundColor Cyan
    $iscc = $null
    $isccCandidates = @(
        (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
        (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe')
    )
    foreach ($c in $isccCandidates) {
        if ($c -and (Test-Path $c)) { $iscc = $c; break }
    }
    if (-not $iscc) {
        $cmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
        if ($cmd) { $iscc = $cmd.Source }
    }

    if (-not $iscc) {
        Write-Warning "ISCC.exe(Inno Setup 6) 를 찾을 수 없습니다. https://jrsoftware.org/isdl.php 에서 설치 후 다시 실행하세요. (포터블 zip 은 이미 생성됨)"
    } else {
        Ensure-Dist   # Atlas.iss 의 OutputDir=..\dist 가 여기로 뱉는다.
        $iss = Join-Path $root 'installer\Atlas.iss'
        & $iscc "/DMyAppVersion=$tag" $iss
        if ($LASTEXITCODE -ne 0) { throw "인스톨러 컴파일 실패 (ISCC exit $LASTEXITCODE)" }
        $setupExe = Join-Path $distDir "Atlas-Setup-$tag.exe"
        if (Test-Path $setupExe) {
            Write-Host "완료. $setupExe 생성됨." -ForegroundColor Green
        } else {
            Write-Warning "ISCC 는 성공했으나 $setupExe 를 찾지 못했습니다. installer\Atlas.iss 의 OutputDir/OutputBaseFilename 을 확인하세요."
        }
    }
}
