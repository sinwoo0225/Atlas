# wbs — WBS 항목

공통 규약: [`common.md`](./common.md). 빠른 레시피: [`query-cookbook.md`](./query-cookbook.md). 에이전트 개발 절차: [`agentic-workflow.md`](./agentic-workflow.md).

## 역할(kind) — 먼저 알아둘 것

WBS 항목은 **작업(`Task`)** 또는 **그룹(`Group`)** 이다. 구조(자식 유무)와는 **별개 축**이라, 자식이 있는 Task(상위 작업)도 자식이 없는 Group(빈 그룹)도 성립한다.

| | 집계 | 상태·담당자·공수 | 표시 |
|---|---|---|---|
| **Task** | 모든 지표에 **1건으로 잡힌다** (자식이 있어도) | 자기 값을 쓴다 | 자기 상태 |
| **Group** | 완료율·잔여·지연·미할당·용량·번업 **전부에서 제외** | 값은 보존하되 **무시** | 상태·기간·진행률을 **자손 Task 에서 파생** |

- 리프에 첫 자식이 붙으면 부모가 **자동으로 Group 으로 승격**된다(프로젝트 설정 `autoGroupParents`, 기본 켜짐). 상위 작업으로 쓰려면 `--kind Task` 로 되돌린다.
- **지표가 세는 것과 똑같은 집합을 보려면 `--kind Task`.** 필터 없이 조회하면 그룹까지 나온다(트리 구조 그대로).
- `update` 에서 `--kind` 를 생략하면 **역할은 바뀌지 않는다**(다른 필드와 달리 '미지정 = 미변경').

## context — ⭐ 작업 종합 컨텍스트 (한 방 조회)

```
atlas-cli wbs context --id W [--no-children --no-devinfo --no-issues --no-changelogs]
```
작업 한 건의 **본문+Notes / 하위 / 연결 업무정보(풀 DTO — GitRepo `filePath`·Markdown `content` 포함) / 연결 이슈 / 출처 변경이력**을 한 번에. "관련 정보 참고해 개발"을 1콜로(여러 list 호출 대체). 스펙 문서가 크면 `--no-devinfo` 후 granular 조회로 토큰 제어.

## list — 조회 (트리 또는 평면 + 필터 + 셰이핑)

```
atlas-cli wbs list --project N
  [--version V]                                 # WBS 버전 ID (없으면 현재)
  [--status Planned,InProgress,Done]            # 다중
  [--open]                                      # 미완만 = Planned|InProgress
  [--active-on today|YYYY-MM-DD]                # 그 날 진행 중 (시작<=날짜<=종료)
  [--start-from YYYY-MM-DD] [--start-to YYYY-MM-DD]
  [--end-from YYYY-MM-DD] [--end-to YYYY-MM-DD]
  [--assignee "..."]                            # 담당자 부분일치(자유 문자열)
  [--milestone true|false]                      # 마일스톤만/제외
  [--kind Task|Group]                           # 역할. Task = 지표가 세는 집합과 동일
  [--keyword "..."]                             # 이름·메모 부분일치
  [--count|--limit N|--brief|--fields a,b,c]
```

**중요 — 트리 vs 평면**:
- 필터·셰이핑 옵션이 **하나도 없으면** 기존처럼 **트리**(root + nested `children`) 반환.
- 필터나 셰이핑이 **하나라도 있으면** **평면 리스트**를 반환하고 각 항목은 `parentId` 를 포함(계층은 클라가 재구성). 필터가 부모-자식 경계를 가르면 트리로 묶을 때 매칭된 하위 항목이 사라지기 때문.

예:
```powershell
atlas-cli wbs list --project 1                                   # 트리(그룹 포함)
atlas-cli wbs list --project 1 --status InProgress               # 평면, 진행 중만
atlas-cli wbs list --project 1 --status InProgress --active-on today
atlas-cli wbs list --project 1 --open --brief --limit 30
atlas-cli wbs list --project 1 --kind Task --open --count        # 지표의 '잔여' 와 같은 수
atlas-cli wbs list --project 1 --kind Group --brief              # 그루핑 노드만
```
`--brief` 필드: `id, parentId, name, kind, status, assignee, startDate, endDate, isMilestone`.

## get / create / update / move / delete

```
atlas-cli wbs get --id N
atlas-cli wbs create --project N --name "..."
  [--parent N --version V --assignee "..." --start YYYY-MM-DD --end YYYY-MM-DD
   --status Planned --milestone --importance 2 (--order 별칭) --notes "..." --completed YYYY-MM-DD
   --kind Task|Group]
atlas-cli wbs update --id N [...] [--kind Task|Group]   # 부분 갱신 (--kind 생략 = 역할 유지)
atlas-cli wbs move --id N (--parent N | --root)  # subtree 이동, SortOrder 자동 재계산
atlas-cli wbs delete --id N                      # 회의록 ActionItem.promotedWbsItemId 자동 정리
```

> SortOrder 는 생성 시 시작일 그룹 끝에 자동 부여. root 로 옮기려면 `move --root`(update 로는 불가).
> 작업(Task) 완료 시 업무일지 '한 일'에 자동 기록 — 그룹은 조상 컨텍스트로만 등장.
> 하위 작업을 만들면 부모가 자동으로 Group 이 된다. 상위 작업으로 두려면 그 뒤 `update --id <부모> --kind Task`.
> **계획 vs 실적**: `--start`/`--end` = 계획 일자. `--completed`(completedDate) = 실제 완료일 — Done 전환 시 오늘로 자동 스탬프되며 직접 보정 가능(완료 처리가 늦은 경우). Done 에서 벗어나면 클리어. 계획 종료(`--end`) 대비 지연 측정 기준(회고).

## 연결 (관련 정보·이슈)

```
atlas-cli wbs devinfo-links --id W                       # 연결된 업무 정보 목록
atlas-cli wbs issue-links   --id W                       # 연결된 이슈 목록
atlas-cli wbs link-devinfo   --id W --devinfo D          # 업무 정보 연결 (같은 프로젝트, 중복 불가)
atlas-cli wbs unlink-devinfo --id W --devinfo D
atlas-cli wbs link-issue   --id W --issue I [--type RelatesTo|Blocks|ParentOf]
atlas-cli wbs unlink-issue --id W --issue I
```
역방향 조회: `atlas-cli devinfo wbs-links --id D`, `atlas-cli issue wbs-links --id I`.
> `wbs context` 가 위 연결을 모두 묶어 주므로, 개발 맥락 수집엔 `context` 한 번이면 충분. 위 명령은 개별 조회·연결/해제용.
