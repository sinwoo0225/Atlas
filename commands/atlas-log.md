---
description: 완료한 작업 단위를 Atlas에 기록 — WBS 상태·변경이력·업무정보(repo/문서) 연결
argument-hint: <완료한 작업 요약>
allowed-tools: Bash, PowerShell, Read, Write
---

# /atlas-log — 완료 작업을 Atlas에 기록

인자(완료 작업 요약): **$ARGUMENTS**

방금 끝낸 작업 단위를 Atlas에 남겨 **데이터 연결성**을 확보한다. 어떤 개발 워크플로를 쓰든(브랜치·데브로그 유무 무관) 독립적으로 동작. 매핑·정책은 atlas 스킬의 `cli-docs/integration.md`.

## 절차

1. **Atlas 가용성**: `atlas-cli` 없으면 알리고 중단. 현재 repo가 속한 Atlas 프로젝트를 `atlas-cli project list --keyword "<repo/제품명>"`로 확인 — 없으면 **신규 등록 여부 확인** 후 `atlas-cli project create`.
2. **WBS 찾기/생성**: 관련 WBS를 `atlas-cli wbs list --project P --keyword "..."`로 검색. 없으면 `atlas-cli wbs create --project P --name "<작업>" --start <시작일> --status InProgress`.
3. **repo/문서 DevInfo 등록**(없으면):
   - repo → `atlas-cli devinfo create --project P --title "<repo>" --type GitRepo --file-path "<repo 절대경로>"`.
   - 이번 작업의 핵심 설계/개발 문서 → `atlas-cli devinfo create --project P --title "..." --type Markdown --content-file <doc>`(또는 `--type Link --url`).
   - 각각 `atlas-cli wbs link-devinfo --id W --devinfo D`로 작업에 연결.
4. **완료 처리**: `atlas-cli wbs update --id W --status Done`(완료가 늦었으면 `--completed YYYY-MM-DD`).
5. **변경이력**: `atlas-cli changelog create --project P --date <오늘> --content-file <요약.md|-> --impact Low|Medium|High --source-wbs W`. (`--source-wbs`로 남기면 다음 `wbs context`의 sourceChangeLogs에 누적.)
6. **이슈**(있었으면): `atlas-cli issue update --id I --status Resolved`, 미연결이면 `atlas-cli wbs link-issue --id W --issue I`.
7. **검증·보고**: `atlas-cli wbs context --id W`로 WBS + DevInfo(repo/문서) + 변경이력 + 이슈가 한 번에 복원되는지 확인하고 요약 보고.

> PowerShell 한글 I/O는 세션당 UTF-8 설정 + 파일/stdin(`--*-file -`) 권장. 신규 프로젝트 등록·대량 생성은 요약 제시 후 진행.
