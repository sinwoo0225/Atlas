# resource — 리소스 (인원/장비)

공통 규약: [`common.md`](./common.md). **전역** — 프로젝트 스코프 없음(`--project` 없음).

## list — 조회 (필터 + 셰이핑)

```
atlas-cli resource list
  [--type Person|Equipment]      # 없으면 전부
  [--department "..."]           # 부서 부분일치
  [--keyword "..."]              # 이름·이메일 부분일치
  [--count|--limit N|--brief|--fields a,b,c]
```
`--brief` 필드: `id, name, type, department, email`.

## get / create / update / delete / assignments

```
atlas-cli resource get --id N
atlas-cli resource create --name "..."
  [--type Person|Equipment --department ... --email ... --phone ... --notes ...]
atlas-cli resource update --id N [...]
atlas-cli resource delete --id N
atlas-cli resource assignments --id N    # 이 리소스가 할당된 WBS 작업 목록(Assignee 이름 매칭)
```

> type 기본 Person.
