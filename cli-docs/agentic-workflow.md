# 에이전틱 개발 워크플로우 (Atlas 를 작업 지시·추적 허브로)

사용자가 Atlas 에 업무를 관리하고, "atlas-cli 로 A프로젝트 B업무 관련 정보 참고해 개발 계획 세우고 진행해" 라고 지시하면 에이전트가 따라 하는 표준 절차. 공통 규약은 [`common.md`](./common.md).

## 한눈에

```
프로젝트/작업 찾기  →  컨텍스트 한 방 조회  →  실제 저장소에서 개발  →  상태·기록 갱신
project list/search    wbs context --id B        (filePath 의 git repo)     wbs update / changelog create
```

## 1. 프로젝트 A · 작업 B 식별

```powershell
atlas-cli project list --keyword "A" --fields id,name        # A 의 projectId
atlas-cli wbs list --project <pid> --keyword "B" --brief      # B 의 WBS id (평면)
# 키워드가 막연하면 전체 텍스트 검색:
atlas-cli search "B 관련 키워드" --project <pid>
```

## 2. ⭐ 작업 컨텍스트 한 방 조회 (핵심)

```powershell
atlas-cli wbs context --id <wbsId>
```
한 번의 호출로 아래를 묶어 받는다 — "관련 정보 참고" 가 1콜로 끝난다:
- `item` — 작업 본문 + **`notes`**(개발 스펙 자유기술) + status/dates/assignee
- `children` — 하위 작업(1-level)
- `relatedDevInfo` — 연결된 업무 정보 **풀 DTO**: GitRepo 의 **`filePath`(로컬 저장소 경로)**, Markdown 의 **`content`(스펙 문서)**, Link 의 `url`
- `relatedIssues` — 연결된 이슈(설명·상태·우선순위)
- `sourceChangeLogs` — 이 작업이 출처인 과거 변경이력

토큰 절감: 스펙 문서가 크면 `--no-devinfo` 로 빼고 필요한 것만 `devinfo-links --id` → `devinfo get --id` 로. 섹션 토글 `--no-children/--no-issues/--no-changelogs`.

## 3. 실제 저장소에서 개발

`relatedDevInfo` 중 `"type":"GitRepo"` 항목의 `filePath` 가 로컬 git 저장소 경로다. 에이전트는 **그 경로로 이동해 자기 파일/Git 툴로 직접 코드를 읽고 수정**한다(Atlas 는 코드 환경이 아니라 컨텍스트·추적 허브). 한 작업에 저장소가 여러 개일 수 있다.

```powershell
# 예: 컨텍스트에서 얻은 경로
# relatedDevInfo[].filePath = "C:\repos\my-service"  (type=GitRepo)
#  → 에이전트가 cd 후 git log / 파일 읽기 / 편집 / 빌드 / 테스트
```

## 4. 완료 시 상태·기록 갱신

```powershell
atlas-cli wbs update --id <wbsId> --status Done                       # 진행상태 변경(완료 시 업무일지 자동 기록)
atlas-cli changelog create --project <pid> --date 2026-06-07 `        # 무엇을 했는지 기록
  --content-file change.md --impact Medium --source-wbs <wbsId>       # 출처를 작업에 연결
# 관련 이슈가 있었다면:
atlas-cli issue update --id <issueId> --status Resolved
```
`--source-wbs` 로 남긴 변경이력은 다음 번 `wbs context --id <wbsId>` 의 `sourceChangeLogs` 에 자동으로 누적된다 — 작업 이력이 작업에 붙는다.

## 5. 관리자(사용자) 확인

```powershell
atlas-cli wbs list --project <pid> --open --brief          # 남은 일
atlas-cli issue list --project <pid> --open --count        # 미해결 이슈 수
atlas-cli changelog list --project <pid> --from 2026-06-01  # 최근 진행
```
또는 Atlas GUI 로 같은 데이터를 본다(CLI/MCP/GUI 동일 DB, 다음 새로고침 반영).

## 연결(링크) 관리

작업에 자료/이슈를 묶는 것은 보통 GUI 나 아래 명령으로(에이전트가 새 자료를 만들면 직접 연결도 가능):
```powershell
atlas-cli wbs link-devinfo --id <wbsId> --devinfo <devInfoId>
atlas-cli wbs link-issue   --id <wbsId> --issue <issueId> [--type Blocks]
atlas-cli wbs devinfo-links --id <wbsId>     # 조회
atlas-cli wbs issue-links   --id <wbsId>
```

## 권장 세팅 (반복 작업이라면)

- MCP 등록(`claude mcp add --scope user atlas atlas-mcp`) + user-level `~/.claude/CLAUDE.md` 에 "Atlas 작업은 `wbs context` 로 맥락 수집 후 진행" 한 줄. ([`mcp.md`](./mcp.md))
- MCP 동등툴: `atlas_wbs_context`, `atlas_wbs_devinfo_links`, `atlas_wbs_issue_links`, `atlas_wbs_update` 등.
