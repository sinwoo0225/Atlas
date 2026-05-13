# CLAUDE.md

이 문서는 Claude Code (claude.ai/code) 가 이 레포에서 작업할 때 참고할 가이드.

## 한눈에 보기

**Atlas** — *The map of your projects.* 단일 사용자, 로컬 우선 프로젝트 관리 앱. UI 언어는 한국어.

- 데이터: `%USERPROFILE%/Documents/ProjectManager/` 아래 SQLite DB + 프로젝트별 파일 폴더. 원격 백엔드 없음.
- 셸: WPF + WebView2 데스크톱 앱이 ASP.NET Core WebService 를 자식 프로세스로 띄우고 React SPA 를 표시.
- 변경 로그: `docs/개발로그.md` 가 canonical 작업 기록. 세션 작업 결과를 날짜별 섹션으로 append 한다.

### 네이밍 호환성 (변경 금지)

어셈블리/폴더 이름 (`ProjectManager.*`, `Documents/ProjectManager/`) 과 localStorage 키 `pm-hub-settings` 는 과거 이름을 유지한다 — 변경하면 DB 경로와 사용자 설정 호환성이 깨진다. 사용자에게 노출되는 브랜드·타이틀에서만 "Atlas" 를 쓴다.

## 자주 쓰는 커맨드

별도 명시 없으면 레포 루트에서 실행.

- **dev 전체**: `./start.ps1` — 백엔드 `http://localhost:5200` + Vite dev `http://localhost:5173` 을 별도 PowerShell 창에서 띄우고 브라우저를 연다.
- **백엔드만**: `dotnet run --project src/ProjectManager.WebService` (포트는 `appsettings.json` 에 하드코드).
- **프론트만**: `cd frontend; npm run dev` (Vite 가 `/api` → `http://localhost:5200` 프록시).
- **프론트 빌드 / 린트**: `cd frontend; npm run build` / `npm run lint`.
- **배포용 패키징**: `./publish.ps1` — `publish/` 비우고 WebService + DesktopApp 을 win-x64 self-contained 로 같은 폴더에 게시한 뒤 zip. `-SkipZip` 으로 압축 생략. WebService csproj 의 `PublishFrontend` MSBuild target 이 `npm run build` 와 `frontend/dist/**` → `wwwroot/` 복사를 자동 처리하므로 따로 빌드를 또 돌리지 말 것.
- **EF 마이그레이션**: 반드시 **로컬 도구** 사용. 필요하면 `dotnet tool restore` 후 `dotnet ef migrations add <Name> --project src/ProjectManager.Infrastructure --startup-project src/ProjectManager.WebService`. 앱 시작 시 `Program.cs` 의 `db.Database.MigrateAsync()` 가 자동 적용한다.

### EF 도구 버전 함정

`dotnet-tools.json` 이 `dotnet-ef` 를 **8.0.16** 에 핀해두고 `rollForward: false` 로 잠가뒀다. 글로벌 설치된 v10 은 net8.0 프로젝트를 읽지 못하므로, 항상 레포 루트에서 `dotnet ef` 로 호출해 로컬 매니페스트가 이기게 한다.

## 아키텍처

### 프로세스 구조

- **DesktopApp** (`ProjectManager.DesktopApp`, WPF + WebView2, net8.0-windows) 가 사용자 셸. 시작 시 `AppContext.BaseDirectory` 에서 `ProjectManager.WebService.exe` 를 자식 프로세스로 spawn 하고 `GET /api/health` 를 500ms × 최대 40회 폴링한 뒤, 임베디드 WebView2 를 `http://localhost:5200` 으로 향한다. 종료 시 백엔드 프로세스 트리를 kill 한다.
- **WebService** (`ProjectManager.WebService`, ASP.NET Core 8) 가 REST API (`/api/*`) 와 빌드된 React SPA (`wwwroot/`) 를 동시에 서빙한다 (`UseDefaultFiles` + `MapFallbackToFile("index.html")` 로 클라이언트 라우팅 지원).
- dev 에서는 두 서버가 분리돼 있고 Vite 가 `/api` 를 백엔드로 프록시한다. publish 에서는 React `dist/` 가 `wwwroot/` 로 복사돼 동일 origin 에서 서빙되므로 프록시가 없다.

### 백엔드 레이어링 (Clean Architecture, 5 프로젝트)

```
Core           ← Domain 엔티티 (Project, WbsItem, WbsVersion, ChangeLog, Meeting,
                 DevInfoItem, Resource, Issue, WorkLog), DTO, 레포지토리 인터페이스, enum
Infrastructure ← EF Core AppDbContext, 레포지토리, Migrations/, PathResolver
                 (Documents/ProjectManager/ 경로 결정), DevFilesStorage
Application    ← 서비스 (aggregate 단위). ProjectService 는 백업 zip 도 담당.
                 MonitoringService 는 프로젝트 간 집계.
WebService     ← Controllers (얇게), Program.cs DI 와이어링, JsonStringEnumConverter
DesktopApp     ← WPF 셸. 솔루션 내부 다른 프로젝트를 참조하지 않음.
                 런타임에 WebService.exe 를 spawn 할 뿐.
```

의존성은 안쪽으로만 흐른다 (WebService → Application → Core; Infrastructure → Core).

### 영속성 & 파일 경로

`PathResolver` 가 디스크 경로의 단일 진실 소스.

- DB: `%USERPROFILE%/Documents/ProjectManager/projectmanager.db` (SQLite).
- 프로젝트별 파일: `%USERPROFILE%/Documents/ProjectManager/<sanitized-project-name>/DevFiles/...`. `Project.FolderPath` 는 생성 시 `GetProjectFolder(name)` 으로 세팅.
- 프로젝트 백업 (`ProjectService.CreateBackupAsync`) 은 DB + 프로젝트 폴더를 zip 으로 묶는다. SQLite 파일은 `FileShare.ReadWrite | FileShare.Delete` 로 오픈한다 — EF 연결이 여전히 잡고 있을 수 있기 때문.

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

## 알아둘 함정

### Meeting JSON-in-TEXT 컬럼

`Meeting.Attendees`, `Decisions`, `ActionItems` 는 TEXT 컬럼에 JSON 문자열로 저장돼 있고, 프론트 `utils/meetingHelpers.ts` 에서 파싱한다. 레거시 plain-text fallback 파싱 로직이 살아 있으므로, 미팅 코드를 만질 때 함께 보존할 것.

### Publish 단일파일 분리

DesktopApp 의 `Release.pubxml` 은 의도적으로 `PublishSingleFile=false` 다 — WebView2 가 단일파일 패키징과 충돌하기 때문. WebService 의 프로파일은 single-file. 두 프로젝트 모두 같은 `publish/` 디렉토리에 게시돼 데스크톱 exe 가 옆의 백엔드 exe 를 찾을 수 있게 돼 있다.

### wwwroot 는 빌드 산출물

`src/ProjectManager.WebService/wwwroot/` 는 `.gitignore` 됨. `npm run build` 또는 `./publish.ps1` 의 `PublishFrontend` MSBuild target 이 자동으로 채워주므로 직접 손대지 말 것. dev 에서는 Vite dev 서버가 직접 서빙하므로 비어 있어도 무방하다.
