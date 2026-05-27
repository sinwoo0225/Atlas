# Atlas 외부 자동화 매뉴얼 (CLI + MCP)

> 외부 프로세스(특히 다른 Claude Code 세션)에서 Atlas 데이터를 자동으로 넣고 빼기 위한 두 가지 진입로. 자연어 입력 → Claude Code → (CLI exe 또는 MCP 도구 콜) → SQLite. 백엔드 서버 포트가 열려 있지 않아도 작동 (같은 DB 파일을 직접 연다).
>
> - **CLI (`Atlas-Cli.exe`)** — 셸 진입. PowerShell/Bash 스크립트, 사람이 직접 호출, CI/CD 친화.
> - **MCP (`Atlas-Mcp.exe`)** — Claude Code 네이티브 도구 콜. 자연어 한 줄 → 도구 자동 선택 → 결과. friction 최소.
>
> 두 진입로는 같은 `AppServicesRegistration` 서비스 그래프를 공유 — 비즈니스 룰, ActivityLog, IAuditable, WAL 등 동일. 일관성 보장.

## What

`Atlas-Cli.exe` 는 Atlas 의 백엔드 서비스 레이어를 그대로 재사용하는 콘솔 진입점이다. 결과적으로:

- **같은 비즈니스 룰** — 활동 로그 자동 기록, IAuditable (CreatedBy/UpdatedBy), 회의록 ActionItem 승격 정리(C-1) 등 모든 후크 작동
- **같은 데이터 위치** — `%LOCALAPPDATA%\Atlas\config.json` 의 `dataFolder` 자동 발견 (Atlas.exe 가 쓰는 그 DB)
- **GUI 와 동시 실행 안전** — SQLite WAL 모드. Atlas.exe 가 켜진 상태에서도 CLI 가 쓸 수 있고, GUI 가 다음 새로고침에 반영됨

## Where

- Atlas 배포 zip 의 `publish/Atlas-Cli.exe` (Atlas.exe 와 같은 폴더)
- 호출은 PowerShell 에서 `.\Atlas-Cli.exe ...` 또는 절대경로

## Setup

**한글 입출력 (PowerShell 5.1 / Windows PowerShell) — 필수**: 세션 시작 시 한 번:

```powershell
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
```

위 설정 없이 한글이 포함된 인자를 native exe 에 pipe/넘기면 cp949/ascii 로 변환되며 깨진다. CLI 측은 stdin/stdout 모두 UTF-8 강제이지만, PowerShell 이 보내는 바이트 자체가 잘못되면 복구 불가. PowerShell 7+ 도 같은 한 줄 권장.

선택 — actor 식별을 명시하려면:

```powershell
$env:ATLAS_CLI_ACTOR = 'claude-code'   # 기본값과 동일. 활동 페이지 actor 필터에서 'claude-code' 만 추리면 CLI 변경 분리 가능
```

`--actor` 인자는 없음. env 만 사용. 미설정 시 `claude-code` 로 기록.

JSON 출력 들여쓰기가 필요하면 `$env:ATLAS_CLI_PRETTY = '1'`. 기본은 한 줄.

## 출력 규약

- **stdout**: 성공 시 결과 JSON (한 줄). PowerShell `| ConvertFrom-Json` 으로 그대로 파싱
- **stderr**: 에러 시 `{"error":"...","code":"..."}`. exit code 1 (도메인 에러) 또는 2 (미처리 예외)
- 도메인 에러 코드: `not_found`, `missing_target` 등

## 명령 요약

```
atlas-cli project list
atlas-cli project get --id N
atlas-cli project create --name "..." [--category 과제|내부|사업
                                       --description ... --goal ... --status Waiting|InProgress|Done|Maintenance
                                       --start YYYY-MM-DD --end YYYY-MM-DD --budget DEC
                                       --participants "..." --deliverables "..." --links "..."
                                       --git "C:\path\to\repo"]   # git 이력용 경로(열람은 데스크톱 앱 전용)
atlas-cli project update --id N [위 옵션 중 변경할 것만]
atlas-cli project delete --id N

atlas-cli issue list --project N [--status Open|InProgress|Resolved|Closed]
atlas-cli issue get --id N
atlas-cli issue create --project N --title "..." [--description ... --status Open --priority Medium
                                                  --assignee RESOURCE_ID --due YYYY-MM-DD]
atlas-cli issue update --id N [...]
atlas-cli issue delete --id N

atlas-cli wbs list --project N [--version V]
atlas-cli wbs get --id N
atlas-cli wbs create --project N --name "..." [--parent N --version V --assignee "..."
                                               --start YYYY-MM-DD --end YYYY-MM-DD
                                               --status Planned|InProgress|Done
                                               --milestone --order N --notes "..."]
atlas-cli wbs update --id N [...]
atlas-cli wbs move --id N (--parent N | --root)       # subtree 이동, Order 자동 재계산
atlas-cli wbs delete --id N

atlas-cli template list                                                   # 빌트인 + 커스텀 (nodeCount 만)
atlas-cli template get (--id N | --builtin KEY)                           # 노드 트리 포함
atlas-cli template create --name "..." --nodes-file PATH|-                # 노드 트리 JSON (배열)
                          [--description ... --category ...]
atlas-cli template update --id N [--name ... --description ... --category ...
                                  --nodes-file PATH|-]                    # 미지정 시 기존 트리 유지
atlas-cli template delete --id N                                          # 커스텀만 (빌트인 불가)
atlas-cli template apply --project N (--id N | --builtin KEY)             # 프로젝트 WBS 로 인스턴스화(기존 뒤 추가)
                         [--anchor YYYY-MM-DD --version V --skip-weekends]
atlas-cli template from-project --project N --name "..."                  # 기존 WBS → 커스텀 템플릿
                                [--description ... --category ... --version V]
# 노드 JSON: [{name,assignee,offsetStartDays,durationDays,isMilestone,importance,notes,children:[...]}]
#   offsetStartDays=앵커(프로젝트 시작일) 기준 일수, durationDays=기간(마일스톤=0)

atlas-cli meeting list --project N [--keyword "..."]
atlas-cli meeting get --id N
atlas-cli meeting create --project N --date YYYY-MM-DD --topic "..."
                         [--start HH:mm --end HH:mm --attendees "a, b, c"
                          --decisions "md" --discussion "md"
                          --action-items-file PATH    # 또는 - (stdin)
                          --action-items '[...]'      # PowerShell 비추천, file/stdin 사용]
atlas-cli meeting update --id N [...]
atlas-cli meeting delete --id N

atlas-cli changelog list --project N
atlas-cli changelog get --id N
atlas-cli changelog create --project N --date YYYY-MM-DD
                           [--content "md" | --content-file PATH    # 또는 - (stdin)
                            --impact Low|Medium|High|Critical
                            --related-doc-links "..."
                            --source-issue N --source-wbs N]
atlas-cli changelog update --id N [...]
atlas-cli changelog delete --id N

atlas-cli worklog week --project N [--week-start YYYY-MM-DD]   # 미지정 시 오늘 기준 주 (Monday)
atlas-cli worklog upsert --project N --date YYYY-MM-DD
                         [--done "md" | --done-file PATH|-
                          --plan "md" | --plan-file PATH|-
                          --issues "md" | --issues-file PATH|-]
# delete 는 없음 (ProjectId+Date upsert 도메인)

atlas-cli devinfo list --project N
atlas-cli devinfo get --id N
atlas-cli devinfo create --project N --title "..." --type Markdown|File|Link
                         [--storage Copy|Reference                       # File 타입에만 의미
                          --content "md" | --content-file PATH|-          # Markdown 타입
                          --file-path "..."                               # File 타입
                          --url "https://..."                             # Link 타입
                          --tags "api, auth"]
atlas-cli devinfo update --id N [...]
atlas-cli devinfo delete --id N
atlas-cli devinfo tags --project N [--sort alpha|freq]                    # distinct 태그 list

atlas-cli resource list                                                   # 전역 — --project 없음
atlas-cli resource get --id N
atlas-cli resource create --name "..." [--type Person|Equipment
                                        --department ... --email ... --phone ... --notes ...]
atlas-cli resource update --id N [...]
atlas-cli resource delete --id N
atlas-cli resource assignments --id N                                     # 할당된 WBS 목록
```

자세한 옵션 설명은 `atlas-cli <verb> <action> --help`.

## update 의 partial 갱신 규약

`update` 는 **지정한 옵션만 덮어쓰고 나머지는 기존 값 유지**. 즉:

```powershell
.\Atlas-Cli.exe issue update --id 42 --status Closed
```

는 status 만 Closed 로, title/description/priority/assignee/dueDate 는 그대로.

> 필드를 `null` 로 비우는 별도 옵션은 아직 없다. WBS 의 ParentId 를 root 로(=null) 옮기려면 `wbs move --id N --root` 사용.

## ActionItems JSON 입력 — 파일/stdin 권장

PowerShell 5.1 (Windows PowerShell) 의 native exe 인자 패스는 큰따옴표를 안정적으로 보장하지 못한다. `--%` / here-string 변수 / `\"` escape 모두 환경에 따라 깨지는 경우가 있어, **인라인 `--action-items` 대신 파일 또는 stdin 으로 넘기는 것을 권장**한다.

### 방법 1 — 파일 (가장 단순)

```powershell
$ai = @'
[{"id":"a1","content":"검증 완료","assignee":"sinwoo","deadline":"2026-05-25"}]
'@
$ai | Out-File -FilePath actions.json -Encoding utf8
.\Atlas-Cli.exe meeting create --project 4 --date 2026-05-17 --topic "CLI 테스트" --action-items-file actions.json
Remove-Item actions.json  # 정리
```

### 방법 2 — stdin (임시 파일 없이)

`--action-items-file -` 이면 CLI 가 stdin 을 읽음:

```powershell
'[{"id":"a1","content":"검증 완료","assignee":"sinwoo"}]' |
  .\Atlas-Cli.exe meeting create --project 4 --date 2026-05-17 --topic "CLI 테스트" --action-items-file -
```

### 방법 3 — PowerShell 객체 → ConvertTo-Json 파이프

```powershell
@(
  @{ id='a1'; content='검증 완료'; assignee='sinwoo' }
  @{ id='a2'; content='문서 정리'; assignee='홍길동'; deadline='2026-05-25' }
) | ConvertTo-Json -AsArray |
  .\Atlas-Cli.exe meeting create --project 4 --date 2026-05-17 --topic "CLI 테스트" --action-items-file -
```

각 항목의 `id` 는 임의 문자열 (짧은 슬러그 또는 GUID). 비어 있으면 GUI 가 다음 편집에서 채워 줌.

### 검증 — actionItems 가 객체 배열로 나오면 성공

`meeting list`/`get` 응답의 `actionItems` 필드는 CLI 가 raw JSON string 을 객체로 풀어서 출력한다. 입력이 잘 들어갔다면:

```json
"actionItems":[{"id":"a1","content":"검증 완료","assignee":"sinwoo","deadline":"2026-05-25"}]
```

큰따옴표가 strip 된 invalid JSON 이 저장됐다면 fallback 으로 escape 된 string 으로 보임:

```json
"actionItems":"[{id:a1,content:검증 완료,assignee:sinwoo}]"
```

이 경우 위 file/stdin 방법으로 `meeting update --id N --action-items-file ...` 재호출하면 됨.

> 인라인 `--action-items` 옵션은 비-PowerShell 셸(예: bash, cmd `--% `) 호환을 위해 남겨두지만, PowerShell 환경에서는 위 방법을 우선 사용.

## 자주 쓰는 시나리오

### 1) 오늘 회의록 자동 입력

```powershell
.\Atlas-Cli.exe meeting create --project 1 --date 2026-05-18 `
  --topic "Sprint 회고" --attendees "홍길동, 김철수" `
  --decisions "다음 sprint 주제는 X" `
  --discussion "..." `
  --action-items '[{"id":"a1","content":"문서 정리","assignee":"홍길동"}]'
```

### 2) 이슈 일괄 등록 (PowerShell 루프)

```powershell
@(
  @{ title = '로그인 버그'; priority = 'High' }
  @{ title = '다크모드 폰트'; priority = 'Low' }
) | ForEach-Object {
  .\Atlas-Cli.exe issue create --project 1 --title $_.title --priority $_.priority
}
```

### 3) WBS 트리 구성

```powershell
$root = .\Atlas-Cli.exe wbs create --project 1 --name "백엔드" | ConvertFrom-Json
.\Atlas-Cli.exe wbs create --project 1 --parent $root.id --name "API 설계"
.\Atlas-Cli.exe wbs create --project 1 --parent $root.id --name "DB 마이그레이션"
```

### 4) 상태 일괄 조회 (대시보드용)

```powershell
.\Atlas-Cli.exe issue list --project 1 --status Open | ConvertFrom-Json |
  Format-Table id, title, priority, dueDate
```

## 주의

- **공유 폴더(SMB) 의 DB 와 동시 사용 금지** — Atlas 가 단독 사용자 가정. WAL 은 로컬 FS 에서만 안전 (`docs/pitfalls.md` 참고)
- **CLI 가 만든 데이터는 GUI 에서 새로고침해야 보임** — Atlas.exe 가 실시간 푸시를 받지는 않는다 (당분간)
- **활동 페이지 actor** 가 `claude-code` 로 박혀 사람 변경과 구분됨. CLI 호출 전에 `$env:ATLAS_CLI_ACTOR` 를 바꿔 분기 가능

---

# MCP 서버 (Atlas-Mcp.exe)

> Claude Code 가 네이티브 도구 콜로 Atlas 데이터에 접근. 셸/JSON 파싱/escape 함정 없이 자연어 → 도구 자동 선택. 등록 1 번 한 뒤로는 그냥 한국어로 요청하면 됨.

## 등록 — Claude Code `.mcp.json` 또는 CLI

### 방법 A — 프로젝트 `.mcp.json` (이 레포 또는 다른 프로젝트 루트에)

```json
{
  "mcpServers": {
    "atlas": {
      "command": "C:\\Users\\<user>\\Documents\\Workspace\\start\\publish\\Atlas-Mcp.exe"
    }
  }
}
```

`<user>` 와 경로는 본인 환경에 맞게. 절대경로 권장 (Claude Code 가 어느 폴더에서 시작돼도 작동).

### 방법 B — Claude Code CLI (권장)

```powershell
claude mcp add --scope user atlas "C:\Users\<user>\...\publish\Atlas-Mcp.exe"
```

`--scope` 옵션:
- **`user`** (권장) — 어디서 Claude Code 를 켜든 atlas 도구 사용 가능. 1 인 단독 사용자 컨텍스트에 자연. 등록은 `~/.claude.json` 의 글로벌 `mcpServers` 에 기록.
- **`project`** — 현재 디렉토리의 `.mcp.json` 파일에 기록 (git 추적 → 팀 공유 가능). 이 레포에서만 활성.
- **(생략, `local`)** — 본인 + 현재 프로젝트 디렉토리에서만. 다른 폴더 작업 중에는 안 보임. 가장 좁은 scope.

### actor (선택)

```powershell
[Environment]::SetEnvironmentVariable('ATLAS_MCP_ACTOR', 'claude-code-mcp', 'User')
```

기본 `claude-code-mcp` — CLI 의 `claude-code` 와 구분되어 활동 페이지에서 진입로 분리 추적 가능. env 가 시스템 또는 사용자 변수로 박혀야 Claude Code 가 spawn 한 자식 프로세스에 전달됨.

## 검증

Claude Code 재시작 후:

```
/mcp
```

→ `atlas` 서버 connected + 21 tools listed (`atlas_project_list`, `atlas_issue_create`, ...).

## 도구 목록 (47 개 — CLI verb 와 1:1)

| 도구 | 설명 |
|---|---|
| `atlas_project_list` / `_get` / `_create` / `_update` / `_delete` | 프로젝트 CRUD (5). create/update 에 `gitRepoPath` |
| `atlas_issue_list` (project + status?) / `_get` / `_create` / `_update` / `_delete` | 이슈 CRUD (5) |
| `atlas_wbs_list` (project + version?) / `_get` / `_create` / `_update` / `_move` / `_delete` | WBS CRUD + 트리 이동 (6) |
| `atlas_template_list` / `_get` (id?/builtinKey?) / `_create` / `_update` / `_delete` / `_apply` (projectId) / `_from_project` | WBS/일정 템플릿 (7). create/update 는 `nodesJson` 트리 |
| `atlas_meeting_list` (project + keyword?) / `_get` / `_create` / `_update` / `_delete` | 회의록 CRUD (5) |
| `atlas_changelog_list` (project) / `_get` / `_create` / `_update` / `_delete` | 변경이력 CRUD (5) |
| `atlas_worklog_week` (project + weekStart?) / `_upsert` (project + date) | 업무일지 — Upsert 도메인 (2) |
| `atlas_devinfo_list` (project) / `_get` / `_create` / `_update` / `_delete` / `_tags` (project + sort?) | 개발 정보 CRUD + tags (6) |
| `atlas_resource_list` / `_get` / `_create` / `_update` / `_delete` / `_assignments` (id) | 리소스 CRUD + 할당 (전역, 6) |

각 도구 `[Description]` 으로 LLM 이 의도 추론. `update` 는 null 필드 = 기존 값 유지 (CLI 와 동일). `wbs_move` 는 root 화 (`root=true`) 또는 새 parent 지정.

### ActionItems 입력 (회의록)

`atlas_meeting_create` / `_update` 의 `actionItemsJson` 파라미터에 JSON 배열 문자열 전달:

```
[{"id":"a1","content":"검증 완료","assignee":"sinwoo","deadline":"2026-05-25"}]
```

LLM 이 자연어 → JSON string 생성 (Claude 는 이걸 잘 함). CLI 의 PowerShell escape 함정 없음 — MCP 도구 콜은 구조화된 인자 전달.

## 시나리오 예시 (Claude Code 자연어)

- "프로젝트 4 의 오픈 이슈 보여 줘" → `atlas_issue_list(projectId=4, status=Open)`
- "프로젝트 4 에 '5월 회고' 라는 High 이슈 추가해" → `atlas_issue_create(projectId=4, title="5월 회고", priority=High)`
- "프로젝트 4 에 오늘 회의록 만들어. 주제 'CLI/MCP 검증', action items 는 ['검증 완료', '문서 정리']" → `atlas_meeting_create(projectId=4, date="2026-05-17", topic="CLI/MCP 검증", actionItemsJson="[{...},{...}]")`
- "WBS 12 를 root 로 옮겨" → `atlas_wbs_move(id=12, root=true)`

## 주의

- **stdio 통신**: stdout 오염 금지 — 로깅은 ClearProviders 적용됨. PR 시 `Console.WriteLine` 추가 금지
- **WAL + 동시성**: Atlas.exe / Atlas-Cli.exe / Atlas-Mcp.exe 셋 다 같은 DB 동시 사용 안전
- **GUI 새로고침**: MCP 가 만든 데이터도 GUI 는 다음 새로고침에 보임
- **에러**: 도구 메서드의 예외는 MCP SDK 가 `isError` 응답으로 자동 변환. LLM 이 사용자에게 자연 응답으로 변환

---

---

## 언제 CLI vs MCP — 토큰·사용 시나리오

같은 데이터를 둘 다 만질 수 있지만, 시나리오에 따라 비용이 다르다.

| 시나리오 | 권장 | 이유 |
|---|---|---|
| **대량 일괄 입력/조회** (N≥10) | **CLI** | 한 PowerShell 루프 = N 호출. LLM 토큰은 스크립트 작성 한 번만 (~수백~1500 토큰). MCP 는 매 호출마다 인자/응답 JSON 누적 (71건 = 약 30,000+ 토큰) |
| **단건 / 즉석 요청** ("이슈 하나 만들어", "오늘 작업 정리해줘") | **MCP** | 자연어 → 도구 자동 선택. 스크립트 작성·디버깅 friction 없음. 토큰 차이 미미 |
| **CI/CD · cron · 셸 자동화** | **CLI** | exit code + stdout JSON, 표준 파이프 친화 |
| **타입 안전한 enum/필드 입력** | **MCP** | 도구 시그니처가 LLM 추론 도움 (`status=Open|InProgress|Resolved|Closed` 등) |
| **PowerShell escape 함정 회피** | **MCP** | CLI 의 큰따옴표 strip 함정 없음 — 도구 콜은 구조화된 인자 |

**예**: 71 dev log → ChangeLog 일괄 import 는 CLI (사이클 40). "방금 닫힌 이슈 #42 에 대한 ChangeLog 한 줄" 은 MCP.

curl (REST API) 은 토큰 측면 CLI 와 유사하지만 백엔드 가동 + API 키 필요 — 단독 사용자 컨텍스트에선 CLI 가 더 단순.

---

## 다른 머신에서 Atlas CLI/MCP 인식시키기

새 컴퓨터에 Atlas 를 깐 뒤 그 컴퓨터의 Claude Code 가 Atlas 데이터를 다룰 수 있게 하는 3 가지 방법. **MCP 등록 + user-level CLAUDE.md 한 줄** 조합 권장.

### 1. MCP 등록 (가장 깔끔)

```powershell
claude mcp add --scope user atlas "C:\path\to\publish\Atlas-Mcp.exe"
```

- `--scope user` — 어느 폴더에서 Claude Code 켜도 `atlas_*` 도구 40 개 자동 노출
- Claude Code 재시작 후 `/mcp` 로 `atlas` 서버 connected 확인
- 등록 1 회 / 자연어 → 도구 자동 선택 / 매번 권한 prompt 없음

### 2. user-level CLAUDE.md (CLI 의 존재·사용법 안내)

위치: `~/.claude/CLAUDE.md` (모든 프로젝트 공통)

```markdown
## Atlas CLI (외부 자동화)

- 실행: `C:\path\to\publish\Atlas-Cli.exe` (자세한 사용법: 같은 폴더의 `ATLAS-CLI-USAGE.md`)
- 데이터 폴더 자동 발견 (`%LOCALAPPDATA%\Atlas\config.json` 의 `dataFolder`)
- **PowerShell 5.1 에서 한글 입출력 시 세션 시작에 한 번**:
  ```powershell
  $OutputEncoding = [System.Text.Encoding]::UTF8
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  ```
- 대량 일괄은 CLI / 단건은 MCP 권장 (위 매뉴얼 참고)
```

→ Claude 가 conversation 시작 시 자동 로드. "Atlas 프로젝트 4 의 오픈 이슈 리스트" 같은 요청에 CLI 를 자연스럽게 선택.

### 3. settings.json 권한 (Bash prompt 회피)

`~/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(*\\Atlas-Cli.exe *)",
      "Bash(*\\publish\\Atlas-Cli.exe *)"
    ]
  }
}
```

→ 매번 "Atlas-Cli.exe 실행 허용?" 모달 없이 통과. MCP 만 쓰면 불필요.

### 권장 조합

1. **MCP 등록** (1 회) — 자연어 즉석 요청 처리
2. **user CLAUDE.md 1 줄** — "Atlas 대량 입력은 CLI, 단건은 MCP" 가이드
3. (선택) **settings.json 권한** — CLI 도 같이 쓸 때 prompt 회피

> 단독 사용자 컨텍스트라 settings.json 의 권한 범위는 자유롭게 — 팀 공유 시는 `Bash(*)` 같은 광범위 권한 주의.

---

## 후속

- ChangeLog / WorkLog / DevInfo / Resource 의 CLI + MCP 전부 추가 완료 (사이클 40 / 41 — 2026-05-18). "CLI/MCP 4 엔티티 외 도구 추가" 백로그 완전 마감
- 보류된 helper — WorkLog `append-done` / DevInfo `rename-tag` `merge-tags` 는 사용 패턴 누적 후 추가
- ActionItems 같은 JSON-in-TEXT 필드의 타입화 입력 (record[] 직접 지원) — SDK 검증 후 업그레이드
