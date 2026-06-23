# MCP 서버 (Atlas-Mcp.exe)

Claude Code 가 네이티브 도구 콜로 Atlas 데이터에 접근. 셸/escape 함정 없이 자연어 → 도구 자동 선택. 등록 1회 후엔 한국어로 요청만 하면 됨. 데이터·비즈니스 룰·필터는 CLI 와 동일(같은 서비스 그래프).

## Claude Code 스킬 (권장 — 사용법 자동 주입)

```powershell
atlas-cli skill install        # 배포본에 동봉된 스킬을 ~/.claude/skills/atlas 로 복사 (--force 로 갱신)
```
이러면 **어느 프로젝트에서 Claude Code 를 켜든** "atlas-cli 로 …" 요청에 스킬이 자동 적용(워크플로우·필터/셰이핑 규약·`wbs context` 우선·명령 인덱스). MCP 가 "도구"를 준다면 스킬은 "언제·어떤 순서로"(오리엔테이션)를 준다 — 둘 다 두면 최상. 스킬은 Store/포터블/인스톨러에 동봉되며, MSIX 인스톨러 자체는 `~/.claude` 에 못 쓰므로(샌드박스) 위 명령으로 한 번 배치한다.

## 등록

### 방법 A — Claude Code CLI (권장)
```powershell
# Store 설치본 — App Execution Alias (버전 올라가도 경로 안정)
claude mcp add --scope user atlas atlas-mcp
# 포터블 zip — exe 절대경로
claude mcp add --scope user atlas "C:\...\publish\Atlas-Mcp.exe"
```
`--scope user` = 어느 폴더에서 켜도 사용. `project` = 현재 `.mcp.json`(팀 공유). 생략 = local.

### 방법 B — `.mcp.json`
```json
{ "mcpServers": { "atlas": { "command": "atlas-mcp" } } }
```
(포터블은 `"command"` 에 `Atlas-Mcp.exe` 절대경로.)

### actor (선택)
```powershell
[Environment]::SetEnvironmentVariable('ATLAS_MCP_ACTOR', 'claude-code-mcp', 'User')
```
기본 `claude-code-mcp` — 활동 페이지에서 CLI(`claude-code`)와 분리 추적.

## 검증
Claude Code 재시작 후 `/mcp` → `atlas` connected + **74 tools**.

## 도구 목록 (74개 — CLI verb 와 대응)

| 도구 군 | 개수 | 비고 |
|---|---|---|
| `atlas_project_*` (list/get/create/update/delete) | 5 | list 에 상태·기간·구분 필터 + 셰이핑 |
| `atlas_issue_*` | 5 | list 에 statuses/open/priorities/assignee/기한/overdue/keyword + 셰이핑 |
| `atlas_wbs_*` (+ move, **context**) | 7 | list 필터·평면. **`atlas_wbs_context`** = 작업 종합 컨텍스트 한 방 |
| `atlas_template_*` (+ apply/from_project) | 7 | nodesJson 트리 |
| `atlas_meeting_*` | 5 | list 에 keyword/category/from/to + 셰이핑 |
| `atlas_changelog_*` | 5 | list 에 impacts/from/to/source* /keyword + 셰이핑 |
| `atlas_worklog_*` (week/upsert) | 2 | |
| `atlas_devinfo_*` (+ tags) | 6 | list 에 types/tags/updated*/keyword + 셰이핑 |
| `atlas_resource_*` (+ assignments, **resolve**, **capacity/utilization**) | 9 | 전역. `resolve` = 이름으로 Person 찾기/생성. `capacity`/`utilization` = 시간기반 용량·가동률 |
| `atlas_wbs_link_dep`/`unlink_dep`/`deps`/`critical_path`/`reschedule` | 5 | 의존성·임계경로(CPM)·자동 리스케줄(push-only, --from 생략 시 프로젝트 전체) |
| **`atlas_plan_context`** | 1 | ⭐ 용량인지 계획 번들(작업+의존성+배정+자원+임계경로+진단) 1콜. `cli-docs/scheduling.md` |
| `atlas_meeting_promote_action` | 1 | 회의록 ActionItem → Issue/WBS 승격 |
| `atlas_todo_*` (list/get/create/update/complete/delete) + **`atlas_my_work`** | 7 | 독립 TODO(+반복) + 통합 '내 업무'(미완 WBS/이슈/TODO) |
| `atlas_wbs_devinfo_links` / `atlas_devinfo_wbs_links` / `atlas_wbs_link_devinfo` / `atlas_wbs_unlink_devinfo` | 4 | WBS ↔ 업무 정보 연결 |
| `atlas_wbs_issue_links` / `atlas_issue_wbs_links` / `atlas_issue_link_wbs` / `atlas_issue_unlink_wbs` | 4 | Issue ↔ WBS 연결 (type: RelatesTo/Blocks/ParentOf) |
| `atlas_search` | 1 | 전체 텍스트 검색(엔티티 횡단) |

> **`atlas_wbs_context(wbsItemId, includeChildren?, includeDevInfo?, includeIssues?, includeChangeLogs?)`** — 에이전트 개발 워크플로우의 중심. item·children·relatedDevInfo(filePath=깃 경로·content=스펙)·relatedIssues·sourceChangeLogs 를 1콜로. 절차: [`agentic-workflow.md`](./agentic-workflow.md).

### 셰이핑·필터 파라미터 (모든 `*_list`)
- 필터: 위 표의 각 파라미터(enum 다중은 배열 `statuses=["Open","InProgress"]`, `open=true` 편의 등). 의미는 CLI 와 동일 — [`common.md`](./common.md) 참조.
- 출력 셰이핑: `count`(bool, 개수만) · `limit`(int) · `brief`(bool) · `fields`(쉼표문자열). 토큰 절감.
- `update` 는 null 필드 = 기존 값 유지. `wbs_move` 는 `root=true` 로 root 화.

### ActionItems (회의록)
`atlas_meeting_create`/`_update` 의 `actionItemsJson` 에 JSON 배열 문자열:
```
[{"id":"a1","content":"검증 완료","assignee":"sinwoo","deadline":"2026-05-25"}]
```
MCP 는 구조화 인자라 CLI 의 PowerShell escape 함정이 없다.

## 언제 CLI vs MCP

| 시나리오 | 권장 | 이유 |
|---|---|---|
| 대량 일괄 입력/조회 (N≥10) | **CLI** | 스크립트 한 번 = N 호출. MCP 는 호출마다 인자/응답 토큰 누적 |
| 단건·즉석 ("이슈 하나 만들어") | **MCP** | 자연어 → 도구 자동, friction 없음 |
| 타깃 조회 ("진행 중 업무 중 오늘 기간 내") | **둘 다** | 필터·셰이핑이 양쪽 동일. 토큰 더 줄이려면 `count`/`brief`/`fields` |
| CI/CD·cron·셸 자동화 | **CLI** | exit code + stdout JSON |
| escape 함정 회피 / 타입 안전 | **MCP** | 구조화 인자, enum 시그니처 |

## 주의
- **stdio 순수성**: stdout 오염 금지(로깅 ClearProviders). PR 시 `Console.WriteLine` 추가 금지.
- WAL: Atlas.exe / Cli / Mcp 셋 다 같은 DB 동시 사용 안전. GUI 는 다음 새로고침에 반영.
- 새 도구(`atlas_search`·필터 파라미터 등)는 **새 Atlas-Mcp.exe** 라 재등록/재시작 후 노출.

## 다른 머신에서 인식시키기

1. **MCP 등록**: `claude mcp add --scope user atlas atlas-mcp` (Store) — 1회.
2. **user-level CLAUDE.md** (`~/.claude/CLAUDE.md`) 한 줄: CLI 존재·`ATLAS-CLI-USAGE.md` 위치·PowerShell UTF-8 안내 + "대량은 CLI, 단건은 MCP".
3. (선택) `~/.claude/settings.json` 의 `permissions.allow` 에 `"Bash(*\\Atlas-Cli.exe *)"` — CLI 실행 prompt 회피. MCP 만 쓰면 불필요.
