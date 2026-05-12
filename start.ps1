# 프로젝트 관리 앱 실행 스크립트
$rootDir = $PSScriptRoot
$backendDir = Join-Path $rootDir "src\ProjectManager.WebService"
$frontendDir = Join-Path $rootDir "frontend"

Write-Host "===== MiPala 시작 =====" -ForegroundColor Cyan

# 백엔드 실행 (백그라운드)
Write-Host "백엔드 서버 시작 중... (http://localhost:5200)" -ForegroundColor Yellow
$backend = Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$backendDir'; dotnet run" -PassThru

Start-Sleep -Seconds 3

# 프론트엔드 dev 서버 실행
Write-Host "프론트엔드 시작 중... (http://localhost:5173)" -ForegroundColor Yellow
$frontend = Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$frontendDir'; npm run dev" -PassThru

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "============================" -ForegroundColor Green
Write-Host "앱 실행 완료!" -ForegroundColor Green
Write-Host "브라우저에서 열기: http://localhost:5173" -ForegroundColor Green
Write-Host "============================`n" -ForegroundColor Green

# 브라우저 열기
Start-Process "http://localhost:5173"

Write-Host "종료하려면 열려있는 PowerShell 창들을 닫으세요." -ForegroundColor Gray
