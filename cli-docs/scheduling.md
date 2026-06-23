# 자원 용량 · 일정 지능 · 계획 컨텍스트 (CLI + MCP)

프로젝트·자원 기준 일정 계획을 에이전트가 다루기 위한 명령. 용량(시간 기반)·작업 의존성·임계경로(CPM)·자동 리스케줄·기준선·회의록 승격, 그리고 이 전부를 1콜로 모으는 **plan context** 번들.

> ⚠ **신규 MCP 도구는 재등록 필요**: 아래 MCP 도구(`atlas_plan_context`, `atlas_wbs_*`, `atlas_resource_capacity/utilization`, `atlas_meeting_promote_action` 등)는 `Atlas-Mcp.exe` 재빌드(`publish.ps1`) + `claude mcp` 재등록 + Claude Code 재시작 후에 노출된다. CLI 동사는 재빌드만 하면 된다.

## 1. ⭐ plan context — 용량인지 계획 번들 (먼저 이걸 호출)

리스케줄·자원 배분을 추론할 때 **list 콜 여러 번 대신** 이 한 번으로 프로젝트의 모든 계획 데이터를 모은다 (`wbs context` 의 일정 계획 버전).

```
atlas-cli plan context --project N [--version V] [--no-resources] [--no-critical-path]
# MCP: atlas_plan_context(projectId, versionId?, includeResources?=true, includeCriticalPath?=true)
```

반환: `project` · `tasks`(공수·일정·상태) · `dependencies` · `allocations`(자원 배분%) · `resources`(주당 가용·단가·스킬) · `criticalPath`(ES/EF/LS/LF·부동·임계) · `diagnostics`(마감초과·의존성위반).

## 2. 자원 용량 (시간 기반)

```
atlas-cli resource create/update ... --weekly-capacity 40 --cost-rate 5 --bill-rate 8 --skills "백엔드,QA" --active true
atlas-cli resource capacity [--id R] [--weeks 8]        # --id 생략 시 전 자원 히트맵
atlas-cli resource utilization [--weeks 8] [--department 부서]   # 교차 프로젝트 가동률 리포트
atlas-cli resource availability add|list|delete ...     # 휴가·공휴일(용량 차감)
atlas-cli wbs assign --id W --resource <이름|ID> [--allocation 100]   # 구조화 배정 + 배분%
atlas-cli wbs assignments --id W
atlas-cli wbs backfill-assignments                      # 기존 자유텍스트 담당자 → WbsAssignment 일괄 동기화
```
수요 = 작업 공수(`--estimate-hours`)를 일정의 영업일에 배분율대로 분배. 용량 = 주당 가용 − 휴가. 가동률·과배분 산출.

## 3. 작업 의존성 · 임계경로 · 자동 리스케줄

```
atlas-cli wbs link-dep --pred P --succ S [--type FinishToStart|StartToStart|FinishToFinish|StartToFinish] [--lag N]
atlas-cli wbs unlink-dep --pred P --succ S
atlas-cli wbs deps --project N            # 또는 --id W (그 작업에 닿는 의존성)
atlas-cli wbs critical-path --project N [--skip-weekends]      # CPM
atlas-cli wbs reschedule --project N [--from W] [--apply] [--skip-weekends]
  #  --from 지정 → 그 작업 후행만 / 생략 → 프로젝트 전체. 기본 미리보기, --apply 시 적용 (push-only=늦추기만)
```
의존성 추가 시 사이클·다른 프로젝트는 거부. 리스케줄은 duration 보존하며 의존성 충족하도록 후행을 뒤로 민다.

**propose → apply 패턴**(안전): `reschedule`(--apply 없이)로 이동 목록을 받아 검토 → 확인되면 같은 명령에 `--apply`. 적용은 `WbsService.UpdateAsync` 경유라 동시성 토큰·완료 스탬프·동기화가 보존된다. 결정론 엔진이라 같은 입력=같은 결과.

## 4. 기준선 (baseline)

```
atlas-cli wbs baseline capture --project N [--version V]   # 현재 계획 일정을 기준선으로 박제
atlas-cli wbs baseline clear --project N
```
Gantt '기준선' 토글로 고스트 막대·variance 비교. 시점 스냅샷이 아니라 작업 단위로 현재 계획을 복사(버전 매칭 불필요).

## 5. 회의록 ActionItem → 작업 승격 (에이전트 노출)

```
atlas-cli meeting promote --id <회의록ID> --action <uuid> --to issue|wbs
# MCP: atlas_meeting_promote_action(meetingId, actionItemId, target="Issue"|"Wbs")
```
담당자 이름 매칭·마감일 파싱. 이미 승격된 ActionItem 은 거부(중복 가드). UI 전용이던 승격을 CLI/MCP 로 노출.

## 에이전틱 워크플로우 — 용량인지 리스케줄

1. `plan context --project N` 으로 작업·의존성·배정·용량·임계경로·진단을 1콜 수집
2. `diagnostics` 의 `overdue`/`dependency_violation` 확인
3. `wbs reschedule --project N` (미리보기)로 이동안 검토
4. 확인 후 `wbs reschedule --project N --apply`
5. 과배분은 `resource utilization` / `resource capacity` 로 점검 후 `wbs assign --allocation` 으로 재배분
