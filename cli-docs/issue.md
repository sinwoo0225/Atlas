# issue — 이슈

공통 규약(필터·셰이핑·인코딩·출력): [`common.md`](./common.md). 빠른 레시피: [`query-cookbook.md`](./query-cookbook.md).

## list — 조회 (DB-side 필터 + 셰이핑)

```
atlas-cli issue list --project N
  [--status Open,InProgress,Resolved,Closed]   # 다중(콤마/반복). 없으면 전부
  [--open]                                      # 미해결만 = Open|InProgress (--status 미지정 시)
  [--priority Low,Medium,High]                  # 다중
  [--assignee-id RESOURCE_ID]                   # 담당자 정확 일치(FK)
  [--assignee-name "이름"]                       # 담당자 이름 부분일치
  [--due-from YYYY-MM-DD] [--due-to YYYY-MM-DD]
  [--occurred-from YYYY-MM-DD] [--occurred-to YYYY-MM-DD]
  [--overdue]                                   # 기한 초과 미완료 (DueDate<today & 미해결)
  [--keyword "..."]                             # 제목·설명 부분일치
  [--count|--limit N|--brief|--fields a,b,c]    # 출력 셰이핑
```

예:
```powershell
atlas-cli issue list --project 1 --open                          # 미해결 전부
atlas-cli issue list --project 1 --open --priority High --count  # 고우선 미해결 개수
atlas-cli issue list --project 1 --overdue --brief
```
`--brief` 필드: `id, title, status, priority, dueDate`.

## get / create / update / delete

```
atlas-cli issue get --id N
atlas-cli issue create --project N --title "..."
  [--description "..." --status Open --priority Medium
   --assignee RESOURCE_ID --due YYYY-MM-DD --occurred YYYY-MM-DD]
atlas-cli issue update --id N [위 옵션 중 변경할 것만]    # 부분 갱신
atlas-cli issue delete --id N                            # 회의록 ActionItem.promotedIssueId 자동 정리
atlas-cli issue wbs-links --id N                         # 이 이슈에 연결된 WBS 항목 목록
```

이슈↔WBS 연결/해제는 `wbs link-issue`/`wbs unlink-issue` ([`wbs.md`](./wbs.md)).

> create/update 의 `--assignee` 는 **Resource ID**(int). list 의 담당자 필터는 `--assignee-id`(정확) / `--assignee-name`(이름 부분일치)로 분리돼 있다.
> status 기본 Open, priority 기본 Medium. 신규 이슈는 등록 당일 업무일지 '이슈' 필드에 자동 추가, 완료(Resolved/Closed) 전환 시 '한 일'에 자동 기록.
