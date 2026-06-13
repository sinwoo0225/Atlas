# todo — 독립 TODO + 통합 '내 업무(my-work)'

공통 규약: [`common.md`](./common.md). **전역** — 프로젝트 스코프 없음.

독립 TODO 는 어느 프로젝트에도 속하지 않는 개인 할 일이다. `my-work` 는 이 독립 TODO 와 **프로젝트의 미완 WBS·미해결 이슈**(내게 할당된)를 한 리스트로 합쳐 보여 준다.

## my-work — ⭐ 통합 '내 업무' 한 방 조회

```
atlas-cli todo my-work [--assignee RESOURCE_ID]
```
미완 WBS(담당자 이름 매칭) + 미해결 이슈(`AssigneeResourceId` 일치) + 미완 독립 TODO 를 한 리스트로. `--assignee` 생략 시 **전체**(필터 없음). 각 행:

`sourceType`(`wbs`|`issue`|`todo`) · `id` · `projectId`/`projectName`(독립 TODO 는 null) · `title` · `status` · `priority`(이슈만) · `dueDate` · `completedDate` · `recurrence`(TODO만).

> '나' 는 보통 한 Resource 로 통일한다 — GUI 설정의 "기본 작성자 이름(나)" 저장 시 같은 이름의 Person 리소스가 자동 연동된다(`resource resolve`, [`resource.md`](./resource.md)). 그 Resource ID 를 `--assignee` 로 넘기면 내 업무만.

## list / get / create / update / complete / delete

```
atlas-cli todo list [--open] [--assignee RESOURCE_ID] [--keyword "..."]
atlas-cli todo get --id N
atlas-cli todo create --title "..."
  [--notes "..." --assignee RESOURCE_ID --due YYYY-MM-DD --status Open
   --recurrence None|Daily|Weekly|Monthly|Yearly --interval N]
atlas-cli todo update --id N [위 옵션 중 변경할 것만]    # 부분 갱신
atlas-cli todo complete --id N                          # 완료 처리 (반복이면 다음 회차 자동 생성)
atlas-cli todo delete --id N
```

예:
```powershell
atlas-cli todo create --title "주간 보고" --due 2026-06-13 --recurrence Weekly
atlas-cli todo my-work --assignee 3        # 3번 리소스(=나)에게 할당된 미완 전체
atlas-cli todo complete --id 7             # Done + 반복이면 다음 회차 Open 생성
```

## 반복(recurrence) 동작

- `complete` 시에만 다음 회차를 생성(편집으로 Done 만들 땐 생성 안 함 — 중복 방지). 완료는 멱등(이미 Done 이면 재생성 없음).
- **하이브리드 기준**: 마감일(`--due`)이 있으면 `이전 마감일 + 주기`, 없으면 `완료일 + 주기`. `--interval N` = N 주기마다(예: `--recurrence Weekly --interval 2` = 2주마다).
- 한 번에 **다음 1회차만** 생성(밀린 회차 소급 없음). `Monthly`/`Yearly` 는 .NET 월말 클램핑(1/31→2/28).

> 담당자는 일관성을 위해 Resource FK(`--assignee` = Resource ID). WBS 의 자유 문자열 담당자와 달리 정확 일치로 my-work 집계에 잡힌다.
