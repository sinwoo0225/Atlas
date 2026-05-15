# Atlas

> *The map of your projects.* — 단일 사용자를 위한 로컬 우선 프로젝트 관리 데스크톱 앱.

Atlas 는 한 사람이 여러 프로젝트의 일정·이슈·회의·변경 이력·자료를 한 곳에서 관리하기 위한 Windows 데스크톱 앱입니다. 모든 데이터는 SQLite DB 와 프로젝트별 파일 폴더로 로컬에 저장됩니다 — 기본 위치는 `%USERPROFILE%\Documents\ProjectManager\` 이며, 설정에서 다른 폴더(예: 본인 멀티 디바이스용 외부 드라이브, 사내 SMB 공유 폴더)로 변경할 수 있습니다. 원격 백엔드나 계정 가입은 없습니다. WPF + WebView2 셸 안에서 ASP.NET Core 가 인프로세스로 실행되고 그 위에 React SPA UI 가 올라가는 구조입니다. UI 언어는 한국어.

## 주요 기능

- **프로젝트 단위 관리** — 프로젝트 카드 목록, 대시보드 (개요·예산·인원·D-day·최근 활동 위젯), 프로젝트 단위 zip 백업.
- **WBS + 간트차트** — 계층 작업 트리, 마일스톤, 상태 (예정/진행/완료), 중요도, 멀티 담당자 칩 입력(Enter/콤마 단위), 버전 관리, 마크다운 노트.
- **업무 일지** — 주 단위로 "한 일 / 계획 / 이슈" 3 필드를 일별로 마크다운 기록. 통합 모니터링에서 주간 md 파일 내보내기.
- **이슈 관리** — Open / InProgress / Resolved / Closed × Low / Medium / High, 표 위에서 BadgeMenu 로 인라인 상태 변경.
- **변경 이력** — 영향도 (Low ~ Critical), 일자별 스택 바 차트, 관련 문서·회의록 링크.
- **회의록** — 30 분 단위 시작/종료, 참석자, 논의 내용, 의사 결정, 액션 아이템 (담당자·마감일). 데이터 폴더의 `Meetings/` 에 사람이 읽기 좋은 md 로 자동 export (Obsidian 등 외부 리더 호환).
- **개발 정보** — 마크다운 (frontmatter + `DevInfo/` 폴더에 자동 export) / 파일 (Copy: 데이터 폴더 카피 / Reference: 원위치 경로만 저장) / 외부 링크 3 가지 타입 + 태그.
- **프로젝트 맵** — Cytoscape + dagre 그래프로 WBS·이슈·회의·변경·개발 정보 간 관계를 시각화 (정오각형 5 hub 방사형 / 타임라인 레이아웃, 미니맵).
- **모니터링** — 전 프로젝트 통합 뷰: 종합 시각화 4종 (프로젝트 상태 분포 / 이슈 상태×우선순위 매트릭스 / 다가오는 30일 마일스톤 / 프로젝트별 WBS 진행률), 오늘 예정 마일스톤, 금주·지난주 업무 일지.
- **리소스 관리** — 인원·장비 리소스, WBS 담당자 자동완성에 사용. 한 작업에 여러 담당자가 있어도 정확히 매칭.
- **설정** — 다크/라이트 테마, 마크다운 글자 크기·줄간격, 최근 프로젝트 기억, 데이터 폴더 위치 변경(네이티브 폴더 다이얼로그).

## 스크린샷

> 스크린샷은 추후 추가 예정. 아래 경로에 PNG 가 들어갈 예정입니다.
>
> - 대시보드: `screenshots/dashboard.png`
> - WBS 간트차트: `screenshots/wbs-gantt.png`
> - 프로젝트 맵: `screenshots/project-map.png`

## 시작하기 (사용자)

1. 릴리스 zip 을 받아 원하는 폴더에 압축 해제.
2. `Atlas.exe` 실행.

요구 사항:

- Windows 10 / 11.
- WebView2 Runtime — Windows 11 은 기본 포함, Windows 10 은 [Evergreen Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) 설치 필요.

데이터 위치:

- 기본값: `%USERPROFILE%\Documents\ProjectManager\` — SQLite DB (`projectmanager.db`) + 프로젝트별 파일 폴더.
- 설정 > 데이터 > 저장 위치 에서 다른 폴더로 변경 가능 (예: 본인 멀티 디바이스용 외부 드라이브). 변경 후에는 Atlas 재시작이 필요합니다.
- 백업: 폴더 전체를 복사하거나, 앱 대시보드의 "백업" 버튼으로 프로젝트 단위 zip 생성.

다중 사용자 (Client 모드):

같은 데이터를 팀이 같이 보려면 한 머신에서 `Atlas-Server.exe` 를 띄우고 다른 머신의 `Atlas.exe` 들이 그 서버에 붙는 방식입니다.

- **서버**: 릴리스의 `Atlas-Server-*.zip` 을 풀고 `run-server.cmd` 의 `ATLAS_API_KEY` 를 팀 공유 시크릿으로 바꾼 뒤 실행. 기본 5200 포트로 listen. 5200 인바운드 방화벽 허용 필요. 서버 머신의 `%LOCALAPPDATA%\Atlas\config.json` 의 `dataFolder` 가 진실 — 운영자가 직접 편집.
- **클라이언트**: `Atlas.exe` 실행 후 설정 > 연결 방식 → Client 선택 → 서버 URL (예: `http://atlas.intranet:5200`) + API 키 입력 → "테스트" → 저장 → Atlas 재시작.
- 같은 항목을 두 사람이 거의 동시에 편집하면 한쪽이 409 응답을 받습니다 (낙관적 동시성 토큰). 새로고침 후 재시도.
- TLS 는 평문 HTTP (사내 LAN 가정). 인터넷 노출이 필요하면 외부 reverse proxy + TLS 권장.

## 개발 환경

요구 사항:

- .NET 8 SDK
- Node.js 20+
- PowerShell 5.1+

레포 클론 후:

```powershell
dotnet tool restore
cd frontend; npm install; cd ..
./start.ps1
```

`start.ps1` 은 백엔드 (http://localhost:5200) 와 Vite dev 서버 (http://localhost:5173) 를 별도 PowerShell 창에서 실행한 뒤 브라우저를 자동으로 엽니다.

개별 실행:

```powershell
dotnet run --project src/ProjectManager.WebService
# 다른 창에서
cd frontend; npm run dev
```

프론트 빌드 / 린트:

```powershell
cd frontend
npm run build
npm run lint
```

## 빌드 & 배포

```powershell
./publish.ps1            # publish/Atlas.exe + publish/wwwroot + Atlas-YYYYMMDD_HHMMSS.zip
./publish.ps1 -SkipZip   # zip 생성 생략
./publish.ps1 -Server    # publish/server/Atlas-Server.exe (Client 모드 서버용) + Atlas-Server-YYYYMMDD_HHMMSS.zip
```

기본 산출물은 단일 self-contained `Atlas.exe` 입니다 — WebService 가 인프로세스 AppHost 로 통합되어 별도 백엔드 exe 가 필요 없습니다. `-Server` 옵션은 별도로 standalone `Atlas-Server.exe` 를 만들어 다중 사용자 환경의 서버 머신에 배포합니다.

## 아키텍처

- **DesktopApp** (`src/ProjectManager.DesktopApp`, WPF + WebView2, net8.0-windows) — 사용자 셸. AppHost 라이브러리를 인프로세스로 호스팅.
- **WebService** (`src/ProjectManager.WebService`, ASP.NET Core 8) — `/api/*` REST + `wwwroot/` SPA 서빙.
- **Application / Infrastructure / Core** — Clean Architecture, SQLite + EF Core 8.
- **Frontend** (`frontend/`) — React 19 + Vite + Tailwind 4 + Zustand, ECharts (차트), Cytoscape + dagre (그래프), react-markdown.

더 자세한 아키텍처 노트·네이밍 호환성 규칙·publish 시 단일파일 추출 경로 등의 디테일은 `CLAUDE.md` 참고.

## 기술 스택

- **Backend** — .NET 8, ASP.NET Core 8, Entity Framework Core 8 (SQLite).
- **Desktop Shell** — WPF, Microsoft.Web.WebView2.
- **Frontend** — React 19, Vite 8, TypeScript, Tailwind CSS 4, Zustand 5, ECharts 6, Cytoscape 3 + dagre, react-markdown, lucide-react.

## 라이선스

MIT — 자세한 내용은 [`LICENSE`](./LICENSE) 참고. Copyright (c) 2026 SlnU.

---

## English

> *The map of your projects.* — A local-first project management desktop app for a single user.

Atlas is a Windows desktop application that lets one person manage schedules, issues, meetings, change logs, and notes across multiple projects in one place. All data is stored locally as a SQLite database and per-project file folders — the default location is `%USERPROFILE%\Documents\ProjectManager\`, but you can change it from Settings to any other folder (e.g. an external drive for multi-device use, or a corporate SMB share). No remote backend, no account. The shell is WPF + WebView2 hosting ASP.NET Core in-process, with a React SPA on top. The UI is in Korean.

### Features

- **Project hub** — Project card list, dashboard (overview, budget, members, D-day, recent activity widgets), per-project zip backup.
- **WBS + Gantt chart** — Hierarchical task tree, milestones, status (Planned / InProgress / Done), priority, multi-assignee chip input (commit per Enter / comma), version management, Markdown notes.
- **Worklog** — Weekly journal with three Markdown fields per day: Done / Plan / Issues. Export the week as a Markdown file from the monitoring page.
- **Issues** — Open / InProgress / Resolved / Closed × Low / Medium / High, with inline status edits via a portal-based BadgeMenu.
- **Change log** — Impact level (Low ~ Critical), stacked daily bar chart, links to related documents and meetings.
- **Meetings** — 30-minute time slots, attendees, discussion, decisions, action items (assignee, due date). Auto-exported as a human-readable Markdown file under `Meetings/` (compatible with Obsidian and other external readers).
- **Dev info** — Three item types (Markdown — auto-exported with frontmatter to `DevInfo/` / File — choose between Copy: copied into the data folder, or Reference: only the original absolute path is stored / external Link) plus tagging.
- **Project map** — Cytoscape + dagre graph visualising relationships between WBS items, issues, meetings, change logs, and dev info (regular-pentagon 5-hub radial / timeline layouts, minimap).
- **Monitoring** — Cross-project view: four summary charts (project-status breakdown / issue status×priority matrix / upcoming-30-day milestones / per-project WBS progress), today's milestones, and this/last week's worklogs.
- **Resources** — People and equipment, used as the autocomplete source for WBS assignees. Matches correctly even when a task has multiple assignees.
- **Settings** — Dark / light theme, Markdown font size and line height, remember last project, change data folder location (native folder picker dialog).

### Screenshots

> To be added. PNG files will live under:
>
> - Dashboard: `screenshots/dashboard.png`
> - WBS Gantt: `screenshots/wbs-gantt.png`
> - Project map: `screenshots/project-map.png`

### Getting started (end users)

1. Download the release zip and extract it to any folder.
2. Run `Atlas.exe`.

Requirements:

- Windows 10 / 11.
- WebView2 Runtime — bundled with Windows 11; on Windows 10 install the [Evergreen Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

Data location:

- Default: `%USERPROFILE%\Documents\ProjectManager\` — SQLite DB (`projectmanager.db`) plus per-project file folders.
- You can point this to a different folder (e.g. an external drive) from Settings > Data > Storage location. A restart is required after changing it.
- Backup: copy the entire folder, or use the dashboard's "Backup" button to produce a per-project zip.

Multi-user (Client mode):

To let a team share the same data, run `Atlas-Server.exe` on one machine and have other machines' `Atlas.exe` connect to it.

- **Server**: extract `Atlas-Server-*.zip` from the release, edit `ATLAS_API_KEY` in `run-server.cmd` to a shared team secret, run it. Listens on port 5200; allow inbound. The server's `%LOCALAPPDATA%\Atlas\config.json` (`dataFolder` field) is authoritative — edit it directly to relocate.
- **Client**: launch `Atlas.exe`, go to Settings > Connection mode → Client, enter the server URL (e.g. `http://atlas.intranet:5200`) and API key, "Test", Save, restart Atlas.
- Two people editing the same item nearly simultaneously will see one of them get a 409 response (optimistic concurrency token). Refresh and retry.
- TLS is plain HTTP (corporate LAN assumed). For internet exposure, put a reverse proxy with TLS in front.

### Development

Requirements: .NET 8 SDK, Node.js 20+, PowerShell 5.1+.

After cloning:

```powershell
dotnet tool restore
cd frontend; npm install; cd ..
./start.ps1
```

`start.ps1` launches the backend (http://localhost:5200) and Vite dev server (http://localhost:5173) in separate PowerShell windows and opens the browser.

Run components individually:

```powershell
dotnet run --project src/ProjectManager.WebService
# in another window
cd frontend; npm run dev
```

Frontend build / lint:

```powershell
cd frontend
npm run build
npm run lint
```

### Build & publish

```powershell
./publish.ps1            # publish/Atlas.exe + publish/wwwroot + Atlas-YYYYMMDD_HHMMSS.zip
./publish.ps1 -SkipZip   # skip the zip step
./publish.ps1 -Server    # publish/server/Atlas-Server.exe (Client-mode server) + Atlas-Server-YYYYMMDD_HHMMSS.zip
```

The default output is a single self-contained `Atlas.exe` — the WebService is folded into an in-process AppHost, so there is no separate backend executable. The `-Server` switch additionally builds a standalone `Atlas-Server.exe` for deployment to the server machine in multi-user setups.

### Architecture

- **DesktopApp** (`src/ProjectManager.DesktopApp`, WPF + WebView2, net8.0-windows) — user shell, hosts the AppHost library in-process.
- **WebService** (`src/ProjectManager.WebService`, ASP.NET Core 8) — `/api/*` REST + `wwwroot/` SPA.
- **Application / Infrastructure / Core** — Clean Architecture, SQLite + EF Core 8.
- **Frontend** (`frontend/`) — React 19 + Vite + Tailwind 4 + Zustand, ECharts (charts), Cytoscape + dagre (graphs), react-markdown.

See `CLAUDE.md` for the deeper architecture notes, naming-compatibility rules, and publish-time single-file extraction caveats.

### Tech stack

- **Backend** — .NET 8, ASP.NET Core 8, Entity Framework Core 8 (SQLite).
- **Desktop shell** — WPF, Microsoft.Web.WebView2.
- **Frontend** — React 19, Vite 8, TypeScript, Tailwind CSS 4, Zustand 5, ECharts 6, Cytoscape 3 + dagre, react-markdown, lucide-react.

### License

MIT — see [`LICENSE`](./LICENSE). Copyright (c) 2026 SlnU.
