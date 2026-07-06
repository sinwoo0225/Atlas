# Atlas 외부 자동화 매뉴얼 (CLI + MCP) — 라우터

> 외부 프로세스(특히 다른 Claude Code 세션)에서 Atlas 데이터를 자동으로 넣고 빼기 위한 두 진입로. 자연어 → Claude Code → (CLI exe 또는 MCP 도구 콜) → SQLite. 백엔드 포트가 닫혀 있어도 작동(같은 DB 파일을 직접 연다).
>
> - **CLI (`Atlas-Cli.exe`)** — 셸 진입. PowerShell/Bash, CI/CD, 대량 일괄.
> - **MCP (`Atlas-Mcp.exe`)** — Claude Code 네이티브 도구 콜. 단건·즉석.
>
> 두 진입로는 같은 `AppServicesRegistration` 서비스 그래프를 공유 — 비즈니스 룰·ActivityLog·필터까지 동일.

## ⚡ 에이전트에게: 필요한 파일만 읽어라

이 파일은 **인덱스**다. 작업에 맞는 기능 파일 하나만 Read 하면 된다(토큰 절약). 전부 `cli-docs/` 아래:

| 하려는 일 | 읽을 파일 |
|---|---|
| **공통 규약** — 설치·인코딩·출력 형식·필터 문법·셰이핑(count/limit/brief/fields) | [`cli-docs/common.md`](./cli-docs/common.md) |
| **에이전틱 개발 워크플로우** — "A프로젝트 B업무 개발해" 지시 → 컨텍스트 수집→개발→상태갱신 절차 | [`cli-docs/agentic-workflow.md`](./cli-docs/agentic-workflow.md) |
| **빠른 조회 레시피** — "진행 중 업무", "오늘 기간 내", "미해결 이슈", "작업 컨텍스트" 등 자연어→명령 | [`cli-docs/query-cookbook.md`](./cli-docs/query-cookbook.md) |
| 이슈 조회/필터/CRUD | [`cli-docs/issue.md`](./cli-docs/issue.md) |
| WBS 조회/필터/트리/CRUD | [`cli-docs/wbs.md`](./cli-docs/wbs.md) |
| **내 업무(my-work)** — 독립 TODO + 미완 WBS/이슈 통합·반복 TODO | [`cli-docs/todo.md`](./cli-docs/todo.md) |
| 프로젝트 조회/필터/CRUD | [`cli-docs/project.md`](./cli-docs/project.md) |
| 회의록 조회/필터/CRUD + ActionItems | [`cli-docs/meeting.md`](./cli-docs/meeting.md) |
| 변경이력 조회/필터/CRUD | [`cli-docs/changelog.md`](./cli-docs/changelog.md) |
| 업무 정보(DevInfo) 조회/필터/CRUD/태그 | [`cli-docs/devinfo.md`](./cli-docs/devinfo.md) |
| 업무일지(WorkLog) 주간/upsert | [`cli-docs/worklog.md`](./cli-docs/worklog.md) |
| 리소스(인원/장비) 조회/필터/CRUD | [`cli-docs/resource.md`](./cli-docs/resource.md) |
| **자원 용량·일정 지능·계획 컨텍스트** — 용량/가동률·의존성·임계경로(CPM)·자동 리스케줄·기준선·plan context·회의록 승격 | [`cli-docs/scheduling.md`](./cli-docs/scheduling.md) |
| WBS/일정 템플릿 | [`cli-docs/template.md`](./cli-docs/template.md) |
| **전체 텍스트 검색**(엔티티 횡단) | [`cli-docs/search.md`](./cli-docs/search.md) |
| **MCP** 등록·도구 목록·CLI vs MCP·다른 머신 세팅 | [`cli-docs/mcp.md`](./cli-docs/mcp.md) |

## 명령 한 줄 인덱스

```
atlas-cli project  list|get|create|update|delete                      # cli-docs/project.md
atlas-cli issue    list|get|create|update|delete                      # cli-docs/issue.md
atlas-cli wbs      list|get|create|update|move|delete                 # cli-docs/wbs.md
atlas-cli wbs      context --id W                                     # ⭐ 작업 종합 컨텍스트 한 방
atlas-cli wbs      devinfo-links|issue-links|link-devinfo|link-issue|unlink-*  # 연결
atlas-cli todo     list|get|create|update|complete|delete|my-work     # cli-docs/todo.md  ⭐ 내 업무 통합
atlas-cli template list|get|create|update|delete|apply|from-project   # cli-docs/template.md
atlas-cli meeting  list|get|create|update|delete                      # cli-docs/meeting.md
atlas-cli changelog list|get|create|update|delete                     # cli-docs/changelog.md
atlas-cli worklog  week|upsert                                        # cli-docs/worklog.md
atlas-cli devinfo  list|get|create|update|delete|tags                 # cli-docs/devinfo.md
atlas-cli resource list|get|create|update|delete|assignments|resolve  # cli-docs/resource.md
atlas-cli resource capacity|utilization|availability                  # ⭐ 용량/가동률 (cli-docs/scheduling.md)
atlas-cli wbs      link-dep|unlink-dep|deps|critical-path|reschedule  # ⭐ 의존성·CPM·자동일정
atlas-cli wbs      assign|assignments|baseline|backfill-assignments   # 자원배정·기준선
atlas-cli plan     context --project N                                # ⭐ 용량인지 계획 번들 1콜
atlas-cli meeting  promote --id M --action <uuid> --to issue|wbs      # ActionItem 승격
atlas-cli search   <query> [--project N] [--type ...] [--limit N]     # cli-docs/search.md
```

모든 `list` 는 **DB-side 필터**(상태·기간·담당자 등)와 **출력 셰이핑**(`--count`/`--limit`/`--brief`/`--fields`)을 지원한다 — 전체 dump 후 스캔하지 말 것. 문법은 [`cli-docs/common.md`](./cli-docs/common.md). 자세한 옵션은 각 명령의 `--help`.

## 어디에 있나 / 설치

- **Microsoft Store 설치본**: CLI/MCP 가 App Execution Alias 로 PATH 노출 — `atlas-cli ...` / `atlas-mcp`.
- **포터블 zip**: `publish/Atlas-Cli.exe`.
- 빌드: `publish.ps1` 또는 `publish.ps1 -Msix`.

설치·인코딩·MCP 등록 등 세팅은 [`cli-docs/common.md`](./cli-docs/common.md)(CLI) / [`cli-docs/mcp.md`](./cli-docs/mcp.md)(MCP).

> **Claude Code 스킬·커맨드**: `atlas-cli skill install` 한 번이면 이 가이드가 `~/.claude/skills/atlas` 에, 슬래시 커맨드(`/atlas-log`·`/atlas-meeting`·`/atlas-sync`)가 `~/.claude/commands/atlas-*.md` 에 설치돼 어느 프로젝트에서든 자동 적용. **기존 CLAUDE.md·settings·다른 커맨드는 건드리지 않음**(atlas-*.md 만 덮어쓰기). 업무 연동 정책은 [`cli-docs/integration.md`](./cli-docs/integration.md), 설치·MCP는 [`cli-docs/mcp.md`](./cli-docs/mcp.md).
