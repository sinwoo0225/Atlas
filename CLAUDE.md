# CLAUDE.md

**Atlas** — *The map of your projects.* 로컬 우선 프로젝트 관리 앱. UI 한국어. 변경 로그는 `docs/개발로그/` (1 커밋 = 1 파일).

구동 모드 / 데이터 경로 / 셸 동작 / 네이밍 호환성 (변경 금지) → `docs/architecture.md`, `docs/pitfalls.md`.

## 진행 상태 추적

`docs/TASKS.md` 가 세션 간 작업 추적의 단일 진실 소스. 새 세션은 먼저 이 파일을 읽는다.

- **진행 중**: 식별자 + 시작일 + "다음 단계" 메모 + 미결 결정.
- **백로그**: 미착수 작업·아이디어.
- **완료**: TASKS.md 에서 제거 → `docs/개발로그/YYYY-MM-DD-NN-<slug>.md` 생성 (1 커밋=1 파일) → `docs/개발로그/INDEX.md` 해당 날짜 섹션 상단에 한 줄. 슬러그는 영문 키워드 1-3개 kebab-case.

작업 시작/단계 전환/일단락 시 진행 중 항목의 "다음 단계" 메모를 그 자리에서 갱신 — 다음 세션이 이어가는 핵심 단서.

## 자주 쓰는 커맨드

레포 루트에서 실행:

- **dev 전체**: `./start.ps1` — 백엔드 `:5200` + Vite `:5173` 별창 + 브라우저.
- **백엔드만**: `dotnet run --project src/ProjectManager.WebService`
- **프론트만**: `cd frontend; npm run dev` (Vite 가 `/api` → `:5200` 프록시)
- **빌드 / 린트**: `cd frontend; npm run build` / `npm run lint`
- **배포**: `./publish.ps1` (DesktopApp single-file + `wwwroot/` + `Atlas-Cli.exe` → `Atlas-*.zip`, `-SkipZip` 가능). `./publish.ps1 -Server` 는 `Atlas-Server.exe` + 운영 템플릿 zip.
- **CLI (외부 자동화·Claude Code 세션)**: `publish/Atlas-Cli.exe`. 같은 데이터 폴더 자동 발견. 사용법은 레포 루트 `ATLAS-CLI-USAGE.md`.
- **EF 마이그레이션**: 반드시 **레포 루트**에서 (`dotnet-tools.json` 이 v8.0.16 에 핀 — 글로벌 v10 은 net8 못 읽음). `dotnet ef migrations add <Name> --project src/ProjectManager.Infrastructure --startup-project src/ProjectManager.WebService`. 앱 시작 시 `AppHostFactory.Build` 의 `db.Database.Migrate()` 가 자동 적용.

## 더 보기

자동 컨텍스트 슬림화를 위해 상세는 외부 docs. 주제에 닿으면 Read:

- `docs/architecture.md` — 프로세스 구조 (Local/Client), 백엔드 6 프로젝트 레이어링, 영속성·파일 경로, Enum 직렬화, 프론트 스택·라우팅.
- `docs/ui-patterns.md` — `EditablePreviewField` 마크다운 인플레이스, `BadgeMenu` 인라인 상태.
- `docs/pitfalls.md` — 네이밍 호환성, Meeting JSON-in-TEXT, publish 단일파일 경로, WebView2 LOCALAPPDATA 고정, 다중 사용자(Client 권장 vs SMB 비권장), Client 모드 5종 제약.
- `docs/개발로그/INDEX.md` — 1 커밋=1 파일. 특정 작업 배경·결정·함정은 INDEX 한 줄에서 해당 파일만 Read.
