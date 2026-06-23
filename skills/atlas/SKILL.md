---
name: atlas
description: >-
  Atlas 프로젝트 관리 데이터(projects · WBS 작업 · 이슈 · 업무정보/Work info · 깃 저장소 · 회의록 · 변경이력)를
  atlas-cli(셸) 또는 atlas-mcp(MCP)로 조회·생성·갱신한다. 특정 WBS 작업의 개발 컨텍스트(연결 자료·깃 저장소 경로·관련 이슈·변경이력)를
  한 번에 모으거나, 상태·기간·담당자로 타깃 필터 조회하거나, 작업/이슈 상태를 갱신할 때 사용.
  "atlas-cli로 …", "Atlas의 … 프로젝트/작업/WBS/이슈 …", "이 작업 관련 정보 참고해 개발" 같은 요청에 적용.
allowed-tools: Bash(atlas-cli *)
user-invocable: true
disable-model-invocation: false
---

# Atlas — atlas-cli / atlas-mcp 사용 가이드

Atlas 는 로컬 우선 프로젝트 관리 앱. 외부 자동화 진입로 두 가지(같은 SQLite·같은 비즈니스 룰 공유):
- **`atlas-cli`** (셸) — 대량·스크립트·CI. Store 설치본은 PATH 에 `atlas-cli`, 포터블은 `.\Atlas-Cli.exe`.
- **`atlas-mcp`** (MCP 도구) — 단건·즉석. 등록돼 있으면 `atlas_*` 도구로 자동 호출.

데이터 폴더는 `%LOCALAPPDATA%\Atlas\config.json` 의 `dataFolder` 에서 자동 발견(Atlas.exe 와 동일 DB, 동시 사용 안전).

## PowerShell 한글 입출력 (세션당 1회 — 필수)

```powershell
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
```
한글 본문 입력은 인라인 인자 대신 파일/stdin(`--*-file PATH|-`) 권장.

## ⭐ 개발 작업 워크플로우 ("A프로젝트 B업무 관련 정보 참고해 개발")

```
프로젝트/작업 찾기 → 컨텍스트 한 방 → 실제 저장소에서 개발 → 상태·기록 갱신
```

1. **찾기**
   ```
   atlas-cli project list --keyword "A" --fields id,name      # A 의 projectId
   atlas-cli wbs list --project <pid> --keyword "B" --brief    # B 의 WBS id
   atlas-cli search "키워드" --project <pid>                    # 막연하면 전체 텍스트 검색
   ```
2. **⭐ 컨텍스트 한 방** — "관련 정보 참고"가 1콜로 끝남:
   ```
   atlas-cli wbs context --id <wbsId>
   ```
   반환: `item`(본문+`notes` 스펙) · `children` · `relatedDevInfo`(연결 업무정보 풀 DTO — **GitRepo `filePath`=로컬 저장소 경로**, Markdown `content`=스펙, Link `url`) · `relatedIssues` · `sourceChangeLogs`(이 작업 출처 이력). 토큰 줄이려면 `--no-devinfo` 등.
3. **개발** — `relatedDevInfo` 중 `"type":"GitRepo"` 의 `filePath` 가 로컬 git 저장소. 그 경로로 가서 **자기 파일/Git 툴로 직접** 코드 읽기·수정·빌드·테스트(Atlas 는 컨텍스트·추적 허브, 코드 환경 아님). 저장소가 여러 개일 수 있음.
4. **상태·기록 갱신**
   ```
   atlas-cli wbs update --id <wbsId> --status Done
   atlas-cli changelog create --project <pid> --date <YYYY-MM-DD> --content-file change.md --impact Medium --source-wbs <wbsId>
   atlas-cli issue update --id <issueId> --status Resolved   # 관련 이슈 있었다면
   ```
   `--source-wbs` 로 남긴 변경이력은 다음 `wbs context` 의 `sourceChangeLogs` 에 누적.
5. **관리(사용자)**: `wbs list --open --brief`, `issue list --open --count`, `changelog list --from <date>` 또는 Atlas GUI.

## 필터 / 출력 셰이핑 (모든 `list` 공통 — 전체 dump 금지)

필터는 DB-side. 같은 개념 = 같은 플래그.
- `--status A,B`(다중, 콤마/반복) · `--open`(미해결/미완) · `--active-on today|YYYY-MM-DD`(그 날 진행 중, WBS·프로젝트).
- 날짜 범위 `--due-from/-to`·`--from/-to`·`--start-from`·`--updated-to` 등(to 는 해당일 포함).
- `--type/--impact/--priority`(다중) · `--tag`(AND) · `--assignee-id`/`--assignee-name` · `--overdue` · `--milestone` · `--source-issue/-wbs` · `--keyword`.
- **셰이핑(토큰 절감)**: `--count`(개수만) · `--limit N` · `--brief`(핵심 필드) · `--fields a,b,c`.

예: `atlas-cli issue list --project 1 --open --priority High --count` / `atlas-cli wbs list --project 1 --status InProgress --active-on today`.

> WBS `list` 는 필터/셰이핑 없으면 트리(root+children), 있으면 평면(각 항목 `parentId` 포함).

## CLI vs MCP

- 대량 일괄/스크립트/CI → **CLI**. 단건·즉석·escape 함정 회피 → **MCP**(`atlas_*`). 맥락 수집은 양쪽 다 **`wbs context` / `atlas_wbs_context`** 우선.

## 명령 인덱스 (정확한 플래그는 `atlas-cli <verb> <action> --help`)

```
project  list|get|create|update|delete
issue    list|get|create|update|delete|wbs-links
wbs      list|get|create|update|move|delete|context|devinfo-links|issue-links|link-devinfo|unlink-devinfo|link-issue|unlink-issue
wbs      link-dep|unlink-dep|deps|critical-path|reschedule|assign|assignments|baseline|backfill-assignments  # 의존성·CPM·자동일정·배정·기준선
plan     context --project N                          # ⭐ 용량인지 계획 번들(작업+의존성+배정+자원+임계경로+진단) 1콜
devinfo  list|get|create|update|delete|tags|wbs-links
meeting  list|get|create|update|delete|promote        # promote: ActionItem → Issue/WBS 승격
changelog list|get|create|update|delete
worklog  week|upsert
resource list|get|create|update|delete|assignments|capacity|utilization|availability  # capacity/utilization: 시간기반 용량·가동률
template list|get|create|update|delete|apply|from-project
search   <query> [--project N] [--type ...] [--limit N]
```

심화(엔티티별 전체 플래그·예시)는 Atlas 레포의 `cli-docs/<기능>.md`(또는 CLI 옆 동봉본) / `cli-docs/agentic-workflow.md`.
용량·일정 지능·plan context·회의록 승격은 **`cli-docs/scheduling.md`**. 용량인지 리스케줄은 `plan context` → 검토 → `wbs reschedule --apply`.

## 주의
- 포터블/절대경로로 호출하면 위 `allowed-tools` 가 안 맞을 수 있음 — 그 경우 settings 권한에 `Bash(*Atlas-Cli.exe *)` 추가.
- 신규 MCP 도구는 새 `Atlas-Mcp.exe` 재등록 후 노출.
