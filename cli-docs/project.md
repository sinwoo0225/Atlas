# project — 프로젝트

공통 규약: [`common.md`](./common.md). 전역 명령(특정 프로젝트 스코프 없음).

## list — 조회 (필터 + 셰이핑)

```
atlas-cli project list
  [--status Planned,Waiting,InProgress,Done,Maintenance]   # 다중
  [--open]                                                 # 진행/대기 중만(완료·유지보수 제외)
  [--active-on today|YYYY-MM-DD]                            # 그 날 진행 중(시작<=날짜<=종료)
  [--start-from/-to YYYY-MM-DD] [--end-from/-to YYYY-MM-DD]
  [--category "..."]                                        # 구분 부분일치(과제·내부·사업 등)
  [--keyword "..."]                                         # 이름·설명·목표 부분일치
  [--count|--limit N|--brief|--fields a,b,c]
```

예:
```powershell
atlas-cli project list --open --brief
atlas-cli project list --active-on today --fields id,name,status
atlas-cli project list --category 사업 --count
```
`--brief` 필드: `id, name, status, category, startDate, endDate`.

## get / create / update / delete

```
atlas-cli project get --id N
atlas-cli project create --name "..."
  [--category 과제|내부|사업 --description ... --goal ...
   --status Waiting|InProgress|Done|Maintenance
   --start YYYY-MM-DD --end YYYY-MM-DD --budget DEC
   --participants "..." --deliverables "..." --links "..."
   --git "C:\path\to\repo"      # 레거시 깃 경로(현재는 업무 정보 GitRepo 타입 권장 — devinfo.md)
   --completed YYYY-MM-DD]
atlas-cli project update --id N [...]    # 부분 갱신
atlas-cli project delete --id N
```

> status 기본 Waiting. `--git` 는 레거시 — 깃 이력은 이제 업무 정보의 GitRepo 타입으로 관리(여러 저장소 가능).
> **계획 vs 실적**: `--start`/`--end` = 계획 일자. `--completed`(completedDate) = 실제 완료일 — Done 전환 시 오늘로 자동 스탬프·직접 보정 가능·해제 시 클리어. 프로젝트 회고(완료 프로젝트 비교)의 지연 측정 기준.
