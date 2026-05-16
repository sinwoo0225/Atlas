# CLAUDE.md

이 문서는 Claude Code (claude.ai/code) 가 이 레포에서 작업할 때 참고할 가이드.

## 한눈에 보기

**Atlas** — *The map of your projects.* 로컬 우선 프로젝트 관리 앱. 기본은 단일 사용자지만 **Client 모드** 로 전환하면 원격 `Atlas-Server` 에 붙어 여러 사용자가 같은 데이터를 공유할 수 있다. UI 언어는 한국어.

- **두 가지 동작 모드** (`%LOCALAPPDATA%\Atlas\config.json` 의 `mode` 필드):
  - **Local** (기본) — `Atlas.exe` 가 ASP.NET Core 를 **인프로세스로 호스팅** (`InProcessHost` + TestServer) + 로컬 SQLite. 외부 listen 포트 없음.
  - **Client** — `Atlas.exe` 가 외부 `Atlas-Server.exe` (Kestrel + SQLite) 에 HTTP 로 붙음. 정적파일은 클라 측 `wwwroot/` 그대로 (옵션 A). `X-Atlas-Key` 헤더로 단일 공유 시크릿 인증.
- 데이터: Local 은 `%USERPROFILE%/Documents/ProjectManager/` 기본, 설정에서 변경. Client 는 서버 머신의 데이터 폴더가 진실. 부트스트랩 설정 파일은 머신·계정별 `%LOCALAPPDATA%\Atlas\config.json` (Local/Client 공통).
- 셸: WPF + WebView2 가 `https://atlas.local/...` 가상 URL 로 navigate 하고 `WebResourceRequested` 핸들러가 `/api/*` 를 `_apiClient` (Local: TestServer / Client: 원격 HttpClient) 로 프록시, 그 외는 `wwwroot/` 에서 직접 서빙.
- 변경 로그: `docs/개발로그/` 가 canonical. 1 커밋(혹은 PR) = 1 파일. 진입점은 `docs/개발로그/INDEX.md` (역연대순).

### 네이밍 호환성 (변경 금지)

어셈블리/폴더 이름 (`ProjectManager.*`, `Documents/ProjectManager/`) 과 localStorage 키 `pm-hub-settings` 는 과거 이름을 유지한다 — 변경하면 DB 경로와 사용자 설정 호환성이 깨진다. 사용자에게 노출되는 브랜드·타이틀에서만 "Atlas" 를 쓴다.

## 진행 상태 추적

`docs/TASKS.md` 가 세션 간에 살아남는 작업 추적 단일 진실 소스. 새 세션 시작 시 먼저 이 파일을 읽어 진행 중 작업과 백로그를 파악한다.

- **진행 중**: 작업 식별자 + 시작 날짜 + "다음 단계" 메모 + 미결 결정사항.
- **백로그**: 아직 시작 안 한 작업·아이디어.
- **완료**: 항목을 TASKS.md 에서 제거하고 `docs/개발로그/YYYY-MM-DD-NN-<slug>.md` 를 새로 생성 (1 커밋 = 1 파일). `docs/개발로그/INDEX.md` 의 해당 날짜 섹션 상단에 한 줄 추가. 슬러그는 메뉴 제목에서 영문 키워드 1-3개 kebab-case로.

작업을 시작/단계 전환/일단락하면 진행 중 항목의 "다음 단계" 메모를 그 자리에서 갱신해 둔다. 다음 세션이 같은 작업을 이어가려면 그 메모가 핵심 단서다.

## 자주 쓰는 커맨드

별도 명시 없으면 레포 루트에서 실행.

- **dev 전체**: `./start.ps1` — 백엔드 `http://localhost:5200` + Vite dev `http://localhost:5173` 을 별도 PowerShell 창에서 띄우고 브라우저를 연다.
- **백엔드만**: `dotnet run --project src/ProjectManager.WebService` (포트는 `appsettings.json` 에 하드코드).
- **프론트만**: `cd frontend; npm run dev` (Vite 가 `/api` → `http://localhost:5200` 프록시).
- **프론트 빌드 / 린트**: `cd frontend; npm run build` / `npm run lint`.
- **배포용 패키징**:
  - `./publish.ps1` — DesktopApp 만 win-x64 self-contained single-file 로 `publish/Atlas.exe` + `publish/wwwroot/` 생성 후 `Atlas-YYYYMMDD_HHMMSS.zip`. `-SkipZip` 으로 압축 생략. DesktopApp csproj 의 `PublishFrontend` MSBuild target 이 `npm run build` + `frontend/dist/**` → `publish/wwwroot/` 자동 처리.
  - `./publish.ps1 -Server` — Client 모드 사용자들이 붙는 원격 서버용. WebService 를 `publish/server/Atlas-Server.exe` 로 single-file 게시 + `README-SERVER.txt` + `run-server.cmd` (env 세팅 템플릿) 동봉, `Atlas-Server-YYYYMMDD_HHMMSS.zip` 생성. wwwroot 는 미포함 (클라가 자체 보유).
- **EF 마이그레이션**: 반드시 **로컬 도구** 사용. 필요하면 `dotnet tool restore` 후 `dotnet ef migrations add <Name> --project src/ProjectManager.Infrastructure --startup-project src/ProjectManager.WebService`. 앱 시작 시 `AppHostFactory.Build` 안의 `db.Database.Migrate()` 가 자동 적용한다.

### EF 도구 버전 함정

`dotnet-tools.json` 이 `dotnet-ef` 를 **8.0.16** 에 핀해두고 `rollForward: false` 로 잠가뒀다. 글로벌 설치된 v10 은 net8.0 프로젝트를 읽지 못하므로, 항상 레포 루트에서 `dotnet ef` 로 호출해 로컬 매니페스트가 이기게 한다.

## 더 보기

자동 주입 컨텍스트를 가볍게 두기 위해 상세는 외부 문서로 분리했다. 작업 주제가 닿으면 해당 파일을 Read.

- **아키텍처** (`docs/architecture.md`) — 프로세스 구조 (publish Local/Client + dev 모드 Kestrel·Vite 프록시), 백엔드 레이어링 (Clean Architecture 6 프로젝트, AppHost 가 일반 SDK 인 함정), 영속성 & 파일 경로 (PathResolver, BootstrapConfig, WebView2 사용자 데이터 위치), Enum 직렬화 (TS 타입 동기화), 프론트엔드 구조 (React 19 + Vite 8 + Tailwind 4 + Zustand 라우팅).
- **자주 쓰는 UI 패턴** (`docs/ui-patterns.md`) — 마크다운 인플레이스 편집 (`EditablePreviewField`, `applyTextareaTab`), 표·카드 내 인라인 상태 변경 (`BadgeMenu` + createPortal). 새 폼·테이블에 같은 인터랙션을 도입할 때 재사용.
- **알아둘 함정** (`docs/pitfalls.md`) — Meeting JSON-in-TEXT 컬럼, Publish 단일파일 + WebView2 추출 경로 (`Environment.ProcessPath`), Chromium time picker step 한계, wwwroot 빌드 산출물, WebView2 사용자 데이터·디버그 로그 LOCALAPPDATA 고정, 다중 사용자 (Client 모드 권장 vs SMB·OneDrive 비권장, 동시성 토큰 409), Client 모드 5종 (host bridge 만 연결설정, `X-Atlas-Actor` 비인증, DevInfo Reference disable, DataFolderSection 숨김, 자체서명 TLS 미지원, 클라↔서버 API 버전 mismatch).
- **개발 기록** (`docs/개발로그/INDEX.md`) — 1 커밋 = 1 파일 분할. 특정 작업의 배경·결정·함정 메모를 찾고 싶을 때 INDEX 의 한 줄 목록에서 해당 커밋 파일만 Read.
