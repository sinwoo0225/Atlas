# Atlas CLI 사용법

> 외부 프로세스(특히 다른 Claude Code 세션)에서 Atlas 데이터를 자동으로 넣고 빼기 위한 단일 파일 exe. 자연어 입력 → Claude Code → CLI → SQLite. 백엔드 서버 포트가 열려 있지 않아도 작동 (같은 DB 파일을 직접 연다).

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
atlas-cli project create --name "..." [--description ... --goal ... --status Planned|Waiting|InProgress|Done
                                       --start YYYY-MM-DD --end YYYY-MM-DD --budget DEC
                                       --participants "..." --deliverables "..." --links "..."]
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

atlas-cli meeting list --project N [--keyword "..."]
atlas-cli meeting get --id N
atlas-cli meeting create --project N --date YYYY-MM-DD --topic "..."
                         [--start HH:mm --end HH:mm --attendees "a, b, c"
                          --decisions "md" --discussion "md"
                          --action-items-file PATH    # 또는 - (stdin)
                          --action-items '[...]'      # PowerShell 비추천, file/stdin 사용]
atlas-cli meeting update --id N [...]
atlas-cli meeting delete --id N
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

## 후속

- 사이클 7 — MCP 서버 (`Atlas-Mcp.exe`). CLI 와 같은 코어 위에 stdio MCP 노출. Claude Code `.mcp.json` 등록 한 줄로 도구 콜 가능. 본 매뉴얼에 등록 가이드 추가 예정.
- 핵심 4 엔티티 외 (ChangeLog / WorkLog / DevInfo / Resource) 의 verb 는 사용 패턴 보고 후속 추가.
