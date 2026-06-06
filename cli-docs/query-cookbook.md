# 빠른 조회 레시피 (자연어 → 명령)

자주 묻는 질의를 정확한 한 줄 명령으로. 필터·셰이핑 문법은 [`common.md`](./common.md). `N` = 프로젝트 ID.

## 작업 하나의 모든 맥락 (개발 착수 시)

| 질의 | 명령 |
|---|---|
| **B 작업 개발하려는데 관련 정보 다 줘** | `atlas-cli wbs context --id <wbsId>` (본문·Notes·연결 업무정보(깃 경로·스펙)·연결 이슈·출처 변경이력 한 방) |
| 스펙 문서 빼고 가볍게 | `atlas-cli wbs context --id <wbsId> --no-devinfo` |
| 그 작업에 연결된 깃 저장소 경로만 | `atlas-cli wbs devinfo-links --id <wbsId>` → `devinfo get --id D` 의 `filePath` |

전체 개발 절차(찾기→컨텍스트→개발→상태갱신)는 [`agentic-workflow.md`](./agentic-workflow.md).

## 진행 상태

| 묻고 싶은 것 | 명령 |
|---|---|
| **N 프로젝트의 진행 중인 업무(WBS)** | `atlas-cli wbs list --project N --status InProgress` |
| **그 중 오늘이 기간 안에 든 것** | `atlas-cli wbs list --project N --status InProgress --active-on today` |
| N 프로젝트의 미완 업무 전부(Planned+InProgress) | `atlas-cli wbs list --project N --open` |
| **N 프로젝트의 해결/닫힘이 아닌 이슈** | `atlas-cli issue list --project N --open` (= `--status Open,InProgress`) |
| 진행/대기 중인 프로젝트만 | `atlas-cli project list --open --brief` |
| 오늘 진행 중인 프로젝트 | `atlas-cli project list --active-on today` |

## 기한 / 날짜

| 질의 | 명령 |
|---|---|
| 기한 초과 미완료 이슈 | `atlas-cli issue list --project N --overdue` |
| 이번 달 마감 이슈 | `atlas-cli issue list --project N --due-from 2026-06-01 --due-to 2026-06-30` |
| 6월에 끝나는 WBS | `atlas-cli wbs list --project N --end-from 2026-06-01 --end-to 2026-06-30` |
| 최근 변경이력(6월 이후) | `atlas-cli changelog list --project N --from 2026-06-01` |
| 특정 주 회의록 | `atlas-cli meeting list --project N --from 2026-06-01 --to 2026-06-07` |

## 우선순위 / 영향도 / 담당

| 질의 | 명령 |
|---|---|
| 고우선 미해결 이슈 | `atlas-cli issue list --project N --open --priority High` |
| 담당자(이름)로 이슈 | `atlas-cli issue list --project N --assignee "홍길동"` |
| 담당자(Resource ID)로 정확히 | `atlas-cli issue list --project N --assignee-id 12` |
| High/Critical 변경이력 | `atlas-cli changelog list --project N --impact High,Critical` |
| 특정 이슈가 출처인 변경이력 | `atlas-cli changelog list --project N --source-issue 42` |

## 업무 정보 / 리소스

| 질의 | 명령 |
|---|---|
| 깃 저장소(GitRepo)만 | `atlas-cli devinfo list --project N --type GitRepo` |
| 특정 태그 자료 | `atlas-cli devinfo list --project N --tag api` |
| 인원만(장비 제외) | `atlas-cli resource list --type Person` |
| 특정 부서 인원 | `atlas-cli resource list --type Person --department 개발팀` |

## 키워드를 알 때 (엔티티 모름)

엔티티 타입을 모르고 키워드만 알면 전체 텍스트 검색이 가장 빠르다 → [`search.md`](./search.md):
```powershell
atlas-cli search "마이그레이션" --project N --limit 10
atlas-cli search "로그인 버그" --type Issue,ChangeLog
```

## 개수만 / 축약 (토큰 절감)

```powershell
atlas-cli issue list --project N --open --count               # {"count":7}
atlas-cli wbs list --project N --open --brief                 # 핵심 필드만
atlas-cli issue list --project N --fields id,title,status     # 원하는 필드만
```

> 팁: 먼저 `--count` 로 규모를 보고, `--brief`/`--fields` + `--limit` 로 추려 받은 뒤, 상세가 필요한 항목만 `get --id` 로 가져오면 토큰이 가장 적게 든다.
