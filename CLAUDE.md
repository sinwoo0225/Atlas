# CLAUDE.md

이 문서는 Claude Code (claude.ai/code) 가 이 레포에서 작업할 때 참고할 가이드.

## 한눈에 보기

**Atlas** — *The map of your projects.* 로컬 우선 프로젝트 관리 앱. 기본은 단일 사용자지만 **Client 모드** 로 전환하면 원격 `Atlas-Server` 에 붙어 여러 사용자가 같은 데이터를 공유할 수 있다. UI 언어는 한국어.

- **두 가지 동작 모드** (`%LOCALAPPDATA%\Atlas\config.json` 의 `mode` 필드):
  - **Local** (기본) — `Atlas.exe` 가 ASP.NET Core 를 **인프로세스로 호스팅** (`InProcessHost` + TestServer) + 로컬 SQLite. 외부 listen 포트 없음.
  - **Client** — `Atlas.exe` 가 외부 `Atlas-Server.exe` (Kestrel + SQLite) 에 HTTP 로 붙음. 정적파일은 클라 측 `wwwroot/` 그대로 (옵션 A). `X-Atlas-Key` 헤더로 단일 공유 시크릿 인증.
- 데이터: Local 은 `%USERPROFILE%/Documents/ProjectManager/` 기본, 설정에서 변경. Client 는 서버 머신의 데이터 폴더가 진실. 부트스트랩 설정 파일은 머신·계정별 `%LOCALAPPDATA%\Atlas\config.json` (Local/Client 공통).
- 셸: WPF + WebView2 가 `https://atlas.local/...` 가상 URL 로 navigate 하고 `WebResourceRequested` 핸들러가 `/api/*` 를 `_apiClient` (Local: TestServer / Client: 원격 HttpClient) 로 프록시, 그 외는 `wwwroot/` 에서 직접 서빙.
- 변경 로그: `docs/개발로그.md` 가 canonical 작업 기록. 세션 작업 결과를 날짜별 섹션으로 append 한다.

### 네이밍 호환성 (변경 금지)

어셈블리/폴더 이름 (`ProjectManager.*`, `Documents/ProjectManager/`) 과 localStorage 키 `pm-hub-settings` 는 과거 이름을 유지한다 — 변경하면 DB 경로와 사용자 설정 호환성이 깨진다. 사용자에게 노출되는 브랜드·타이틀에서만 "Atlas" 를 쓴다.

## 진행 상태 추적

`docs/TASKS.md` 가 세션 간에 살아남는 작업 추적 단일 진실 소스. 새 세션 시작 시 먼저 이 파일을 읽어 진행 중 작업과 백로그를 파악한다.

- **진행 중**: 작업 식별자 + 시작 날짜 + "다음 단계" 메모 + 미결 결정사항.
- **백로그**: 아직 시작 안 한 작업·아이디어.
- **완료**: 항목을 TASKS.md 에서 제거하고 `docs/개발로그.md` 의 오늘 날짜 섹션에 append (canonical).

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

## 아키텍처

### 프로세스 구조

publish — **Local 모드** (기본, 단일 `Atlas.exe`):
- **DesktopApp** (`ProjectManager.DesktopApp`, WPF + WebView2, net8.0-windows) 가 사용자 셸. 시작 시 `MainWindow.OnLoaded` 가 `BootstrapConfig.Load()` 의 `Mode` 를 보고 분기 — Local 이면 `InProcessHost.StartAsync` 가 `Microsoft.AspNetCore.TestHost.TestServer` 위에 `AppHostFactory.Build` 로 ASP.NET Core 를 띄우고 `_apiClient = _host.Client` 로 인프로세스 HttpClient 사용. Kestrel 미부팅 → 외부 listen 포트 없음.
- WebView2 는 `https://atlas.local/...` 가상 URL 로 navigate. `CoreWebView2.WebResourceRequested` 핸들러가 모든 요청을 가로채서 `/api/*` 는 `_apiClient` 로 프록시하고, 그 외는 `Environment.ProcessPath` 옆 폴더의 `wwwroot/` 에서 정적 파일을 직접 read + MIME 매핑 + SPA fallback (`index.html`) 로 응답한다. 종료 시 `_host.DisposeAsync` 로 정리.
- `SetVirtualHostNameToFolderMapping` 와 `WebResourceRequested` 가 같은 호스트에 공존하면 가상호스트가 우선되어 핸들러가 발화하지 않는다 — 가상호스트는 쓰지 않고 핸들러 하나로 통일했다.

publish — **Client 모드** (옵션, `Atlas.exe` 클라 + 별도 머신의 `Atlas-Server.exe`):
- DesktopApp 의 `OnLoaded` 가 Client 모드면 `InProcessHost` 를 시작하지 않고 `_apiClient = new HttpClient { BaseAddress = bootstrap.ServerUrl }` 만 세팅. `ApiKey` 가 있으면 `X-Atlas-Key` 기본 헤더로 추가. **나머지 `WebResourceRequested` 흐름 무변경** — `/api/*` 가 `_apiClient` 를 거쳐 원격 Kestrel 로, 정적파일은 클라 측 `wwwroot/` (옵션 A: 클라이언트 측 SPA 버전 고정).
- 서버 측 `Atlas-Server.exe` 는 `ProjectManager.WebService` 를 single-file 게시한 것. `ATLAS_SERVER=1` env 가 정적파일 미들웨어 skip + `ATLAS_API_KEY` env 가 있으면 API 키 미들웨어 활성. `ASPNETCORE_URLS=http://0.0.0.0:5200` 로 LAN 노출.
- 연결 설정(`mode`/`serverUrl`/`apiKey`) 은 API 가 아니라 **host bridge 메시지** (`getConnectionConfig` / `setConnectionConfig` / `testServerConnection`) 로 읽고 쓴다 — Client 모드에서 일반 `/api` 호출은 원격 서버로 라우팅되어 서버측 BootstrapConfig 를 건드리게 되기 때문. 항상 클라 머신 로컬 config 를 만져야 한다.

dev 모드 (`./start.ps1`):
- **WebService** 가 별도 Kestrel 프로세스 (`http://localhost:5200`) 로 떠서 `/api/*` REST 와 `wwwroot/` SPA 를 서빙. Vite dev 서버 (`http://localhost:5173`) 가 `/api` 를 백엔드로 프록시.
- 즉 인프로세스 호스팅은 publish 산출물에만 적용되고, 개발 흐름은 그대로다. 환경변수 `ATLAS_SERVER` / `ATLAS_API_KEY` 를 dev 에서도 설정하면 동일 서버 모드 동작이 그대로 켜진다.

### 백엔드 레이어링 (Clean Architecture, 6 프로젝트)

```
Core           ← Domain 엔티티 (Project, WbsItem, WbsVersion, ChangeLog, Meeting,
                 DevInfoItem, Resource, Issue, WorkLog), DTO, 레포지토리 인터페이스, enum
Infrastructure ← EF Core AppDbContext, 레포지토리, Migrations/, PathResolver,
                 BootstrapConfig (데이터 폴더 위치 결정), DevFilesStorage
Application    ← 서비스 (aggregate 단위). ProjectService 는 백업 zip 도 담당.
                 MonitoringService 는 프로젝트 간 집계.
AppHost        ← Controllers (`Controllers/`) + DI 와이어링 (`AppHostFactory.Build`)
                 + JsonStringEnumConverter. `Microsoft.NET.Sdk` 일반 라이브러리
                 (Web SDK 아님) + `<FrameworkReference Include="Microsoft.AspNetCore.App" />`.
                 WebService 와 DesktopApp 양쪽에서 참조한다.
WebService     ← `Microsoft.NET.Sdk.Web`. dev 용 Kestrel 진입점. Program.cs 는
                 4줄짜리 — `AppHostFactory.Build(WebApplication.CreateBuilder(args)).Run()`.
DesktopApp     ← WPF 셸 (`net8.0-windows`). AppHost 를 직접 참조해 `InProcessHost`
                 로 호스팅. publish 산출물의 단일 `Atlas.exe`.
```

의존성은 안쪽으로만 흐른다 (AppHost/WebService/DesktopApp → Application → Core; Infrastructure → Core). AppHost 는 일반 SDK 라서 `Microsoft.AspNetCore.Http` 같은 implicit using 이 빠진다 — `IFormFile` 등은 명시적 `using` 필요.

### 영속성 & 파일 경로

`PathResolver` (`src/ProjectManager.Infrastructure/Config/PathResolver.cs`) 가 디스크 경로의 단일 진실 소스. 그 `_basePath` 는 `AppHostFactory` 에서 `BootstrapConfig.Load().ResolveDataFolder()` 로 주입된다.

- **부트스트랩 설정**: `%LOCALAPPDATA%\Atlas\config.json` — 머신·계정별. 절대 공유/네트워크 폴더에 두지 않는다 (데이터 폴더 결정 *이전에* 읽혀야 해서 자기참조 불가). 필드:
  - `dataFolder` — Local 모드에서만 의미. 없거나 비어 있으면 기본값 `Documents\ProjectManager\` 로 폴백.
  - `mode` — `"Local"` (기본) / `"Client"`.
  - `serverUrl` — Client 모드에서 `Atlas-Server` 위치 (예: `http://atlas.intranet:5200`).
  - `apiKey` — Client 모드에서 `X-Atlas-Key` 헤더로 전송. 서버의 `ATLAS_API_KEY` env 와 일치해야 함.
- **데이터 폴더 (사용자 선택)**: DB `<dataFolder>\projectmanager.db`, 프로젝트별 파일 `<dataFolder>\<sanitized-project-name>\DevFiles\...`. `Project.FolderPath` 는 생성 시 `PathResolver.GetProjectFolder(name)` 으로 세팅. 사용자가 설정에서 변경하면 `BootstrapConfig.Save` 로 기록되고, **Atlas 재시작 후** 적용된다.
- **WebView2 사용자 데이터 + 디버그 로그**: 데이터 폴더와 무관하게 항상 `%LOCALAPPDATA%\Atlas\` 아래. WebView2 안에는 머신·계정별 상태 (쿠키, `pm-hub-settings` localStorage = 테마·마지막 프로젝트·기본 작성자) 가 들어 있어 공유 폴더에 넣으면 동료끼리 충돌하기 때문. 과거에 `Documents\ProjectManager\WebView2\` 를 쓰던 사용자는 첫 실행 시 자동 이주된다.
- **프로젝트 백업** (`ProjectService.CreateBackupAsync`) 은 DB + 프로젝트 폴더를 zip 으로 묶는다. SQLite 파일은 `FileShare.ReadWrite | FileShare.Delete` 로 오픈한다 — EF 연결이 여전히 잡고 있을 수 있기 때문.

### Enum 직렬화

컨트롤러는 `AddJsonOptions(... JsonStringEnumConverter())` 로 구성돼 있어, 모든 enum (`ProjectStatus`, `WbsStatus`, `ImpactLevel`, `ResourceType`, 이슈 `Status`/`Priority`, `DevInfoType`) 이 문자열 이름으로 직렬화된다. `frontend/src/types/index.ts` 의 TS 타입을 이 문자열 값과 항상 동기화할 것.

### 프론트엔드 구조

- 스택: React 19 + TS + Vite 8 + Tailwind 4 (`@tailwindcss/vite`) + Zustand. 차트는 ECharts, 프로젝트맵은 Cytoscape + dagre, 마크다운 렌더는 `react-markdown`.
- 라우팅은 `frontend/src/App.tsx` 에 선언:
  - 루트: `/`, `/monitoring`, `/resources`, `/settings`
  - 프로젝트별: `/projects/:projectId/{dashboard|wbs|worklog|issues|changelogs|meetings|devinfo|map}`
- API 접근은 모두 `frontend/src/api/client.ts` (단일 `fetch` 래퍼, base `/api`) 를 거친다. aggregate 마다 파일 하나씩 `frontend/src/api/` 아래.
- 다크 테마가 기본. 라이트 모드는 `index.css` 의 `html.light` 오버라이드로 적용되며, `store/settings.ts` (localStorage 저장) 가 토글한다.

## 자주 쓰는 UI 패턴

### 마크다운 인플레이스 편집

쉬는 상태에서는 마크다운으로 렌더된 미리보기를 보여주고, 클릭하면 `<textarea>` 로 전환되며, blur 시 저장하고 다시 미리보기로 돌아오는 패턴. `pages/WorkLogPage.tsx` 의 `EditablePreviewField` 가 표준 구현이고, WBS 등록 폼의 노트 필드(`WbsItemForm` 의 `notesEditing` state) 도 동일한 토글 방식을 쓴다. 새 텍스트 필드에 마크다운을 도입할 때는 이 패턴을 재사용한다.

textarea 의 Tab 키 기본 동작이 포커스 이동이라 마크다운 들여쓰기가 어렵다. `utils/textareaTab.ts` 의 `applyTextareaTab(e, setValue)` 를 `onKeyDown` 에 연결하면 Tab → 2-space 삽입, Shift+Tab → 라인 앞 제거. 마크다운 textarea 를 새로 추가하면 같이 붙인다.

### 표·카드 안 인라인 상태 변경 (BadgeMenu)

WBS·이슈처럼 행에서 status·priority 를 폼 열지 않고 바꾸려면 `components/ui/BadgeMenu.tsx`. Badge 형 트리거 클릭 → 다크 톤 dropdown 메뉴. 부모에 `overflow-hidden` 이 있어도 잘리지 않게 `createPortal` 로 body 에 mount + 트리거 rect 기준 fixed 위치. 스크롤·리사이즈 시 자동 닫힘. 옵션 라벨/variant 는 `utils/statusMaps.ts` 매핑을 `BadgeMenuOption<T>` 로 그대로 변환해 쓴다.

## 알아둘 함정

### Meeting JSON-in-TEXT 컬럼

`Meeting.Attendees`, `Decisions`, `ActionItems` 는 TEXT 컬럼에 JSON 문자열로 저장돼 있고, 프론트 `utils/meetingHelpers.ts` 에서 파싱한다. 레거시 plain-text fallback 파싱 로직이 살아 있으므로, 미팅 코드를 만질 때 함께 보존할 것.

### Publish 단일파일 + WebView2 추출 경로

DesktopApp 만 `PublishSingleFile=true` 로 단일 `Atlas.exe` 산출. 인프로세스 호스팅이라 별도 백엔드 exe 가 게시되지 않는다. WebView2 의 native loader 만 추출되도록 `IncludeNativeLibrariesForSelfExtract=true` 를 켜둔다. `publish/` 안에 `Atlas.exe` 와 `wwwroot/` (`PublishFrontend` MSBuild target 이 채움) 만 있다.

DesktopApp 의 실행파일명은 `<AssemblyName>Atlas</AssemblyName>` 로 `Atlas.exe`. 어셈블리·폴더 이름 (`ProjectManager.*`, 기본 데이터 폴더 `Documents/ProjectManager/`, localStorage 키 `pm-hub-settings`) 호환성은 기존 사용자의 데이터·설정 호환성 때문에 **변경하지 말 것**.

single-file 환경에서 `AppContext.BaseDirectory` 는 임시 추출 폴더가 되므로, 실제 exe 가 있는 폴더 (`wwwroot/` 가 옆에 있는 곳) 를 구할 때는 `Environment.ProcessPath` 의 디렉토리를 쓴다. WebView2 사용자 데이터 폴더는 `CoreWebView2Environment.CreateAsync` 로 `%LOCALAPPDATA%\Atlas\WebView2` 에 명시 고정 — 그렇지 않으면 임시 추출 폴더에 잡혀 세션이 매번 초기화된다. 과거 위치 (`Documents\ProjectManager\WebView2`) 에서 첫 실행 시 자동 이주.

### Chromium time picker 의 step 한계

`<input type="time" step={1800}>` 는 키보드 ↑↓ 와 spinner 단위에만 30분이 적용된다 — picker dropdown 의 분 spinner 는 여전히 0~59 전부 노출. 30분 단위만 선택지로 노출하려면 `<select>` + 48개 슬롯으로 대체한다 (회의록 폼의 시작/종료 시간이 예시). 데이터 모델은 그대로 `"HH:mm"` 문자열.

### wwwroot 는 빌드 산출물

`src/ProjectManager.WebService/wwwroot/` 는 `.gitignore` 됨. `npm run build` 또는 `./publish.ps1` 의 `PublishFrontend` MSBuild target (현재는 `DesktopApp.csproj` 에 있음) 이 자동으로 채워주므로 직접 손대지 말 것. dev 에서는 Vite dev 서버가 직접 서빙하므로 비어 있어도 무방하다.

### WebView2 사용자 데이터는 데이터 폴더와 분리

데이터 폴더를 사내 공유 폴더로 옮길 때 "전부 같이" 옮기고 싶어지는데, **WebView2 사용자 데이터 (`%LOCALAPPDATA%\Atlas\WebView2`) 는 절대 같이 옮기지 말 것**. 그 안에는 머신·계정별 브라우저 상태 — 쿠키, 세션, `pm-hub-settings` localStorage (= 테마, 마지막 프로젝트, 기본 작성자) — 가 들어 있어, 두 사람이 같은 폴더를 가리키면 한쪽 설정이 다른쪽을 덮어쓰고 세션이 매번 초기화된다. 디버그 로그도 같은 이유로 `%LOCALAPPDATA%\Atlas\` 에 고정. `MainWindow.xaml.cs:InitializeWebViewAsync` 와 `TryLog` 가 데이터 폴더 변경과 무관하게 항상 LOCALAPPDATA 를 쓰는 이유.

### 다중 사용자 — Client 모드 권장, SMB 공유 폴더 비권장

다중 사용자가 같은 데이터를 다룰 때는 **Client 모드** (`Atlas-Server.exe` 에 클라이언트들이 붙음) 가 정답이다. 한 프로세스(서버)만이 SQLite 를 잡으므로 SMB 환경의 다중 라이터 위험이 없고, EF `DbContext pool` 이 쓰기를 내부 직렬화한다.

여전히 같은 row 동시 편집의 **last-write-wins** 는 남아 있어, 엔티티 `UpdatedAt` 에 `IsConcurrencyToken()` 을 걸어두었다 (`AppDbContext`). 충돌 시 `DbUpdateConcurrencyException` → 글로벌 미들웨어가 **409 Conflict + 한국어 안내 JSON** 으로 응답한다 (`AppHostFactory`). 프론트는 toast 로 노출 — 사용자는 새로고침 후 재시도.

SQLite 연결문자열에 `Default Timeout=30` 을 박아 짧은 쓰기 충돌은 자동 busy-wait 으로 흡수한다.

Local 모드에서 데이터 폴더를 SMB 공유로 옮겨 두 명 이상이 각자 Atlas 를 띄우는 패턴은 **여전히 비권장**. 이 경우의 위험:
- **백업 zip 중 편집**: `ProjectService.CreateBackupAsync` 가 차단 안 하므로 zip 내용에 부분 트랜잭션이 섞일 수 있음.
- **DB 손상 위험**: SQLite `journal_mode` 기본 `DELETE` 가 SMB 에서 그나마 안전. **WAL 로 바꾸지 말 것** — SMB 가 mmap shared memory 를 잘 못 다뤄서 DB 손상 위험이 커진다. OneDrive/Dropbox/SharePoint 매핑 드라이브 같은 백그라운드 sync 폴더는 더 위험.
- 동시성 토큰은 같은 row last-write-wins 만 잡지 다중 프로세스 SQLite race 전체를 막지는 않는다.

Client 모드로 옮기면 위 위험 모두 사라진다.

### Client 모드 — 알아둘 함정

- **연결 설정은 host bridge 로만**. `BootstrapConfig` 의 `mode`/`serverUrl`/`apiKey` 는 항상 클라이언트 머신 로컬을 만져야 한다. Client 모드에서 `/api` 를 거치면 서버측 BootstrapConfig 를 건드리게 됨. 그래서 `getConnectionConfig` / `setConnectionConfig` / `testServerConnection` 메시지만 사용 (`MainWindow.xaml.cs:OnHostMessageReceived`).
- **DevInfo Reference 모드는 Client 모드에서 disable**. picker 가 클라 머신 경로를 반환하지만 서버가 그 경로를 열 수 없음. 새 항목 생성 시 라디오 비활성 (`DevInfoPage.tsx`). 기존 Reference 항목은 표시만 됨 — 다른 클라에서 열기 시도하면 실패할 수 있다는 점 인지.
- **DataFolderSection 은 Client 모드에서 숨김**. 서버측 데이터 폴더는 운영자가 서버 머신의 `%LOCALAPPDATA%\Atlas\config.json` 을 직접 편집해 변경.
- **자체서명 TLS 미지원**. 현재 평문 HTTP 만. 사내 LAN + API 키 가정. 인터넷 노출은 reverse proxy(nginx 등) + TLS 후 사용자 재량.
- **프론트엔드 ↔ 서버 API 버전 mismatch 위험** — 옵션 A (클라 측 wwwroot 유지) 라 클라이언트 버전과 서버 버전이 다를 수 있음. 큰 API breaking change 가 들어가면 클라 업데이트와 서버 업데이트를 함께 굴리거나, `/api/system/ping` 의 `apiVersion` 으로 mismatch 안내 UX 추가 필요.
