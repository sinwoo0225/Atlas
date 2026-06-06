# meeting — 회의록

공통 규약: [`common.md`](./common.md). ActionItems 입력 패턴이 핵심 — 아래 참조.

## list — 조회 (필터 + 셰이핑)

```
atlas-cli meeting list --project N
  [--keyword "..."]              # 제목·논의·결정 부분일치
  [--category Internal|External] # 내부/외부
  [--from YYYY-MM-DD] [--to YYYY-MM-DD]   # 회의일 범위
  [--count|--limit N|--brief|--fields a,b,c]
```
응답의 `actionItems` 는 DB 의 JSON-in-TEXT 를 객체 배열로 풀어서 출력. `--brief` 필드: `id, date, topic, category, attendees`.

## get / create / update / delete

```
atlas-cli meeting get --id N
atlas-cli meeting create --project N --date YYYY-MM-DD --topic "..."
  [--start HH:mm --end HH:mm --attendees "a, b, c"
   --category Internal|External --decisions "md" --discussion "md"
   --action-items-file PATH|-   # 권장
   --action-items '[...]']       # 인라인(PowerShell 비권장)
atlas-cli meeting update --id N [...]
atlas-cli meeting delete --id N
```

## ActionItems JSON 입력 (file/stdin 권장)

PowerShell 5.1 의 native exe 인자는 큰따옴표를 안정적으로 못 넘기므로 **파일/stdin** 사용:

```powershell
# 파일
'[{"id":"a1","content":"검증 완료","assignee":"sinwoo","deadline":"2026-05-25"}]' |
  Out-File actions.json -Encoding utf8
atlas-cli meeting create --project 4 --date 2026-05-17 --topic "CLI 테스트" --action-items-file actions.json

# stdin (임시 파일 없이)
'[{"id":"a1","content":"검증 완료","assignee":"sinwoo"}]' |
  atlas-cli meeting create --project 4 --date 2026-05-17 --topic "CLI 테스트" --action-items-file -
```
각 항목 `id` 는 임의 슬러그/GUID(비우면 GUI 가 채움). 응답에 `actionItems` 가 객체 배열로 나오면 성공. 큰따옴표가 strip 된 invalid JSON 으로 저장됐다면 위 file/stdin 으로 `meeting update --id N --action-items-file ...` 재호출.

> 회의록 ActionItem 은 이슈/WBS 로 승격 가능(GUI/REST). 이슈·WBS 의 제목 변경/삭제 시 승격된 ActionItem 이 자동 동기화/정리됨.
