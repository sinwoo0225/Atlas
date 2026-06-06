# search — 전체 텍스트 검색 (FTS5)

엔티티 타입을 몰라도 키워드 하나로 횡단 조회 — 전체 dump 없이 바로 타깃에 도달. GUI 글로벌 검색과 **같은 FTS5 색인**(증분 인터셉터로 항상 최신)을 사용한다.

```
atlas-cli search "<검색어>"
  [--project N]                  # 프로젝트 한정(없으면 전역)
  [--type Project,WbsItem,Issue,Meeting,ChangeLog,DevInfoItem,WorkLog]   # 다중
  [--limit N]                    # 기본 50, 최대 200
```

검색어는 공백으로 나뉘어 **AND**(모든 토큰 포함), 부분일치. 결과 행:
```json
{"type":"ChangeLog","id":195,"projectId":1,"projectName":"Atlas",
 "title":"... <mark>키워드</mark> ...","snippet":"... <mark>키워드</mark> ...","updatedAt":"..."}
```
`title`/`snippet` 에 `<mark>...</mark>` 하이라이트 포함. `type`+`id` 로 해당 엔티티의 `get` 호출해 상세 조회.

예:
```powershell
atlas-cli search "마이그레이션" --project 1 --limit 10
atlas-cli search "로그인 버그" --type Issue,ChangeLog
```

## 토큰화 특성 (주의)

기존 SQLite FTS5 `unicode61` 토크나이저를 그대로 쓴다(GUI 검색과 동일). 따라서:
- 영문/숫자, 복합 한국어 토큰(예: `업무일지`, `프로젝트`), 식별자(`WbsDevInfoLink`)는 잘 매칭.
- **아주 짧은 2글자 한국어 토큰**(예: `업무`, `정보`)은 매칭이 약할 수 있다 — 토크나이저 특성이며 CLI/MCP 가 아니라 색인 자체의 성질(GUI 검색도 동일). 짧은 키워드보다 구체적·복합 키워드를 쓰면 결과가 좋다.
- 특정 엔티티의 **구조적 필터**(상태·기간·담당자 등)가 필요하면 검색 대신 각 `list --필터` 를 쓰는 게 정확하다.
