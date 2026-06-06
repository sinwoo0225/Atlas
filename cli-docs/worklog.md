# worklog — 업무일지

공통 규약: [`common.md`](./common.md). Upsert 도메인(ProjectId+Date 단위, delete 없음).

```
atlas-cli worklog week --project N [--week-start YYYY-MM-DD]   # 미지정 시 오늘 기준 주(Monday~Friday)
atlas-cli worklog upsert --project N --date YYYY-MM-DD
  [--done "md"  | --done-file PATH|-     # 한 일
   --plan "md"  | --plan-file PATH|-     # 할 일
   --issues "md"| --issues-file PATH|-]  # 이슈
```

> `week` 는 월~금 5일 범위. 이슈 생성·완료, WBS 리프 완료 시 해당 일자 업무일지에 자동 누적(서비스 훅).
