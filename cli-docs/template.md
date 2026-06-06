# template — WBS/일정 템플릿

공통 규약: [`common.md`](./common.md).

```
atlas-cli template list                                       # 빌트인 + 커스텀 (nodeCount 만)
atlas-cli template get (--id N | --builtin KEY)               # 노드 트리 포함
atlas-cli template create --name "..." --nodes-file PATH|-    # 노드 트리 JSON(배열)
  [--description ... --category ...]
atlas-cli template update --id N [--name ... --description ... --category ...
  --nodes-file PATH|-]                                        # 미지정 시 기존 트리 유지
atlas-cli template delete --id N                              # 커스텀만(빌트인 불가)
atlas-cli template apply --project N (--id N | --builtin KEY) # 프로젝트 WBS 로 인스턴스화(기존 뒤 추가)
  [--anchor YYYY-MM-DD --version V --skip-weekends]
atlas-cli template from-project --project N --name "..."      # 기존 WBS → 커스텀 템플릿
  [--description ... --category ... --version V]
```

노드 JSON 형식:
```
[{name, assignee, offsetStartDays, durationDays, isMilestone, importance, notes, children:[...]}]
```
`offsetStartDays` = 앵커(프로젝트 시작일) 기준 일수, `durationDays` = 기간(마일스톤=0).

> `apply` 의 `--anchor` 미지정 시 프로젝트 시작일 기준. `--skip-weekends` 면 주말 건너뛰며 일정 배치.
