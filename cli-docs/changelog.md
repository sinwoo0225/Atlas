# changelog — 변경이력

공통 규약: [`common.md`](./common.md).

## list — 조회 (필터 + 셰이핑)

```
atlas-cli changelog list --project N
  [--impact Low,Medium,High,Critical]   # 다중
  [--from YYYY-MM-DD] [--to YYYY-MM-DD]  # 날짜 범위
  [--source-issue N]                     # 출처 Issue ID
  [--source-wbs N]                       # 출처 WBS 항목 ID
  [--keyword "..."]                      # 내용 부분일치
  [--count|--limit N|--brief|--fields a,b,c]
```
`--brief` 필드: `id, projectId, date, impact` (큰 `content` 는 제외 — 상세는 `get --id` 또는 `--fields ...,content`).

예:
```powershell
atlas-cli changelog list --project 1 --impact High,Critical --from 2026-06-01
atlas-cli changelog list --project 1 --source-issue 42
```

## get / create / update / delete

```
atlas-cli changelog get --id N
atlas-cli changelog create --project N --date YYYY-MM-DD
  [--content "md" | --content-file PATH|-
   --impact Low|Medium|High|Critical
   --related-doc-links "..."
   --source-issue N --source-wbs N]
atlas-cli changelog update --id N [...]
atlas-cli changelog delete --id N
```

> impact 기본 Low. `--source-issue`/`--source-wbs` 로 어떤 이슈/작업이 이 변경의 원인인지 추적(원본 삭제돼도 changelog 본체는 보존, 출처만 비워짐).
