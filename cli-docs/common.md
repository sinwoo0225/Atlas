# 공통 규약 (CLI)

모든 `atlas-cli` 명령에 적용되는 설치·인코딩·출력·필터·셰이핑 규약. 엔티티별 명령은 같은 폴더의 `<entity>.md` 참조.

## 설치 / 호출

- **Store 설치본**: `atlas-cli ...` (App Execution Alias, PATH).
- **포터블 zip**: `.\publish\Atlas-Cli.exe ...` 또는 절대경로.
- 데이터 폴더 자동 발견: `%LOCALAPPDATA%\Atlas\config.json` 의 `dataFolder` (Atlas.exe 가 쓰는 그 DB). GUI 와 동시 실행 안전(SQLite WAL).

## 한글 입출력 (PowerShell — 필수)

세션 시작 시 한 번:

```powershell
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
```

이 설정 없이 한글 인자를 native exe 에 넘기면 cp949/ascii 로 깨진다. 한글 본문 입력은 인라인 인자보다 **파일/stdin** 권장(`--*-file PATH|-`).

## 출력 규약

- **stdout**: 성공 시 결과 JSON 한 줄. `| ConvertFrom-Json` 으로 파싱. `$env:ATLAS_CLI_PRETTY='1'` 이면 들여쓰기.
- **stderr**: 에러 시 `{"error":"...","code":"..."}` + exit code 1(도메인 에러: `not_found`·`missing_target` 등) 또는 2(미처리). 옵션 파싱 에러(예: 잘못된 enum 값)는 System.CommandLine 표준 메시지 + exit 1.
- `update` 는 **부분 갱신** — 지정한 옵션만 덮어쓰고 나머지는 기존 값 유지. 필드를 명시적으로 null 로 비우는 옵션은 없음(WBS 를 root 로 옮기려면 `wbs move --root`).
- actor 는 활동 로그에 `claude-code` 로 기록. `$env:ATLAS_CLI_ACTOR` 로 변경 가능.

## 필터 문법 (모든 `list` 공통)

필터는 **DB-side WHERE** 로 내려간다 — 전체를 가져와 스캔하지 않는다. 같은 개념은 엔티티 간 같은 플래그명.

- **`--status` (다중값)**: `--status Open,InProgress`(콤마) 또는 `--status Open --status InProgress`(반복) 또는 `--status Open InProgress`(공백). 대소문자 무시. 잘못된 값은 파싱 에러(가능한 값 안내). 단일 값도 그대로 동작(하위호환).
- **`--open` (편의 플래그)**: "미해결/미완"만. `--status` 미지정 시에만 적용.
  - 이슈 = `{Open, InProgress}` · WBS = `{Planned, InProgress}` · 프로젝트 = `{Planned, Waiting, InProgress}`(완료·유지보수 제외).
- **`--active-on today|YYYY-MM-DD`** (WBS·프로젝트): 그 날 진행 중 = `시작일 <= 날짜 <= 종료일`. `today`/`now` 는 실행 시점 당일. 시작/종료가 비어 있으면 그쪽은 **무한대**로 취급(시작 미정 = 이미 시작, 종료 미정 = 아직 안 끝남).
- **날짜 범위** `--*-from` / `--*-to` (예 `--due-from`/`--due-to`, `--from`/`--to`, `--start-from`/`--end-to`, `--updated-from/-to`): from 은 `>=`, to 는 **해당일 전체 포함**(내부적으로 half-open `< 다음날`). `YYYY-MM-DD`.
- **부분일치** `--keyword`·`--assignee`·`--category`·`--department`·`--tag`: 대상 필드 substring 매칭. `--tag` 다중 지정 시 **모두 포함(AND)**.
- enum 단일 필터(`--type`, `--category`, `--impact`(다중), `--priority`(다중) 등)는 각 엔티티 문서 참조.

## 출력 셰이핑 (토큰 절감 — 모든 `list` 공통)

필터로 줄인 결과에 추가로 출력 형태를 줄인다:

- **`--count`**: 배열 대신 `{"count": N}` (필터된 전체 개수, `--limit` 무시).
- **`--limit N`** (별칭 `--take`): 앞에서 N 건만.
- **`--brief`**: 엔티티별 핵심 필드만(id·제목·상태·날짜 등). 큰 본문 필드는 제외 — 식별 후 `get` 으로 상세.
- **`--fields a,b,c`**: 지정한 camelCase 필드만 투영(대소문자 무시). `--brief` 보다 우선.

예:
```powershell
atlas-cli issue list --project 1 --open --count                 # {"count":7}
atlas-cli wbs list --project 1 --status InProgress --brief --limit 20
atlas-cli changelog list --project 1 --impact High,Critical --fields id,date,impact
```

> WBS 만 예외: 필터·셰이핑이 **없으면** 트리(root+children), **있으면** 평면 리스트(각 항목 `parentId` 포함)를 반환. 자세한 건 `wbs.md`.
