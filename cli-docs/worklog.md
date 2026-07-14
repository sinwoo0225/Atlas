# worklog — 업무일지

공통 규약: [`common.md`](./common.md). Upsert 도메인(ProjectId+Date 단위, delete 없음).

```
atlas-cli worklog week --project N [--week-start YYYY-MM-DD]   # 미지정 시 오늘 기준 주(Monday~Friday)
atlas-cli worklog upsert --project N --date YYYY-MM-DD
  [--done "md"  | --done-file PATH|-     # 한 일
   --plan "md"  | --plan-file PATH|-     # 할 일
   --issues "md"| --issues-file PATH|-]  # 이슈
```

> `week` 는 월~금 5일 범위. 이슈 생성·완료, **WBS 작업(`kind=Task`) 착수·완료** 시 해당 일자 업무일지에 자동 누적(서비스 훅). 그룹(`kind=Group`)은 조상 컨텍스트로만 등장하고 자체 항목은 안 생긴다 — 자식이 있어도 Task 면(= 상위 작업) 일지에 남는다.
