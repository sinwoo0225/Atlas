# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"MiPala" — short for *MindPalace* (the WPF/web subtitle reads "MindPalace for Projects"). A personal, single-user, **local-first** project management app. All data lives under `%USERPROFILE%/Documents/ProjectManager/` (SQLite DB + per-project file folders) — there is no remote backend. The product/UI language is Korean.

Note on naming: the assembly/folder names (`ProjectManager.*`, `Documents/ProjectManager/`) and the `pm-hub-settings` localStorage key are preserved from earlier iterations. Don't rename them — it would break the DB path and the user's stored settings. Only the user-facing brand and titles say "MiPala".

`docs/개발로그.md` is the running development changelog. Append a new dated section there for each session's work; treat it as the canonical "what's been done" log.

## Common commands

Run from the repo root unless noted.

- **Run dev (both)**: `./start.ps1` — launches backend on `http://localhost:5200` and Vite dev server on `http://localhost:5173` in separate PowerShell windows, then opens the browser.
- **Backend only**: `dotnet run --project src/ProjectManager.WebService` (port 5200, hardcoded in `appsettings.json`).
- **Frontend only**: `cd frontend; npm run dev` (Vite proxies `/api` → `http://localhost:5200`).
- **Frontend build / lint**: `cd frontend; npm run build` / `npm run lint`.
- **Publish for distribution**: `./publish.ps1` — cleans `publish/`, publishes `WebService` + `DesktopApp` (win-x64 self-contained) into a single folder, and zips it. Use `-SkipZip` to skip archiving. The WebService csproj's `PublishFrontend` MSBuild target runs `npm run build` and copies `frontend/dist/**` → `wwwroot/` automatically before publish — do not duplicate that step.
- **EF migrations**: use the **local** tool, not a global one. `dotnet tool restore` first if needed, then `dotnet ef migrations add <Name> --project src/ProjectManager.Infrastructure --startup-project src/ProjectManager.WebService`. The DB auto-migrates on app start via `db.Database.MigrateAsync()` in `Program.cs`.

### EF tool version gotcha

`dotnet-tools.json` pins `dotnet-ef` to **8.0.16** and `rollForward: false`. A globally-installed v10 `dotnet-ef` cannot read net8.0 projects — always invoke via `dotnet ef` from the repo root so the local manifest wins.

## Architecture

### Process topology

- **DesktopApp** (`ProjectManager.DesktopApp`, WPF + WebView2, net8.0-windows) is the user-facing shell. On launch it spawns `ProjectManager.WebService.exe` as a child process from `AppContext.BaseDirectory`, polls `GET /api/health` up to 40× × 500 ms, then points an embedded WebView2 at `http://localhost:5200`. On close it kills the backend process tree.
- **WebService** (`ProjectManager.WebService`, ASP.NET Core 8) serves both the REST API under `/api/*` and the built React SPA from `wwwroot/` (`UseDefaultFiles` + `MapFallbackToFile("index.html")` for client-side routing).
- In dev, the two run separately and Vite proxies `/api` to the backend. In publish, the React `dist/` is copied into `wwwroot/` and the SPA is served from the same origin as the API — no proxy involved.

### Backend layering (5-project Clean Architecture)

```
Core           ← Domain entities (Project, WbsItem, WbsVersion, ChangeLog, Meeting,
                 DevInfoItem, Resource, Issue), DTOs, repository interfaces, enums
Infrastructure ← EF Core AppDbContext, repositories, Migrations/, PathResolver
                 (resolves Documents/ProjectManager/ paths), DevFilesStorage
Application    ← Services (one per aggregate). ProjectService also handles backup zip.
                 MonitoringService aggregates across projects.
WebService     ← Controllers (thin), Program.cs DI wiring, JsonStringEnumConverter
DesktopApp     ← WPF shell; depends on nothing in the rest of the solution
```

Dependencies flow inward (WebService → Application → Core; Infrastructure → Core). DesktopApp does not reference the other projects — it launches the WebService exe at runtime.

### Persistence & file layout

`PathResolver` is the single source of truth for on-disk paths:

- DB: `%USERPROFILE%/Documents/ProjectManager/projectmanager.db` (SQLite).
- Per-project files: `%USERPROFILE%/Documents/ProjectManager/<sanitized-project-name>/DevFiles/...` — `Project.FolderPath` is set on create from `GetProjectFolder(name)`.
- Project backups (`ProjectService.CreateBackupAsync`) zip the DB + that folder. SQLite files are opened with `FileShare.ReadWrite | FileShare.Delete` because the EF connection may still hold them.

### Enums on the wire

Controllers are configured with `AddJsonOptions(... JsonStringEnumConverter())`. All enums (`ProjectStatus`, `WbsStatus`, `ImpactLevel`, `ResourceType`, issue `Status`/`Priority`, `DevInfoType`) serialize as their string names — keep the TypeScript types in `frontend/src/types/index.ts` aligned with these string values.

### Frontend shape

- React 19 + TS + Vite 8 + Tailwind 4 (`@tailwindcss/vite`) + Zustand. ECharts for charts, Cytoscape (+ dagre) for the project map.
- Routes are declared in `frontend/src/App.tsx`. Per-project pages live under `/projects/:projectId/<area>` (wbs, issues, changelogs, meetings, devinfo, map, dashboard); cross-project pages (`/`, `/monitoring`, `/resources`, `/settings`) sit at the root.
- API access goes through `frontend/src/api/client.ts` (single `fetch` wrapper, base `/api`). One file per aggregate under `frontend/src/api/`.
- Dark theme is the default; light mode applies via `html.light` overrides in `index.css`, driven by `store/settings.ts` (localStorage-backed).

### Things that look duplicated but aren't

- `Meeting.Attendees`, `Decisions`, `ActionItems` are stored as JSON strings in TEXT columns and parsed in the frontend (`utils/meetingHelpers.ts`). There is legacy plain-text fallback parsing — preserve it when touching meeting code.
- The DesktopApp's `Release.pubxml` deliberately sets `PublishSingleFile=false` (WebView2 conflicts with single-file packaging); the WebService's profile is single-file. Both publish into the same `publish/` directory so the desktop exe can find the backend exe next to it.
