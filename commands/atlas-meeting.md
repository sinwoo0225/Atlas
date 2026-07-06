---
description: 이번 세션의 대화·최종 결정사항을 요약해 Atlas 회의록으로 기록
argument-hint: "[주제]"
allowed-tools: Bash, PowerShell, Read, Write
---

# /atlas-meeting — 회의록 작성

인자(선택 주제): **$ARGUMENTS** — 비면 대화 맥락에서 도출.

사용자와 주고받은 대화와 **최종 결정사항**을 요약해 Atlas 회의록(Meeting)으로 남긴다. 매핑·정책은 atlas 스킬의 `cli-docs/integration.md`, 명령 상세는 `cli-docs/meeting.md`.

## 절차

1. **Atlas 가용성**: `atlas-cli` 없으면 로컬 요약만 제시하고 중단. 프로젝트 미등록이면 `atlas-cli project list`로 확인 후 **신규 등록 여부를 사용자에게 확인**(등록하면 `atlas-cli project create --name "..."`).
2. **요약 작성**(한국어): **discussion**(논의 흐름) · **decisions**(최종 결정 불릿 + 근거 한 줄) · **action-items** `[{ "id":"<slug>", "content":"...", "assignee":"...", "deadline":"YYYY-MM-DD"(선택) }]`. 큰 본문·JSON은 파일/stdin(PowerShell 한글은 세션당 UTF-8: `[Console]::OutputEncoding=[Text.Encoding]::UTF8`).
3. **사용자 확인**: 요약(discussion/decisions/action-items)을 **먼저 보여주고** 기록 여부 확인.
4. **기록**: `atlas-cli meeting create --project P --date <오늘> --topic "<주제>" --category Internal --decisions <md|file> --discussion <md|file> --action-items-file <json|->`. 정확한 플래그는 `atlas-cli meeting create --help`.
5. **승격**(선택): 후속 작업이 될 ActionItem은 `atlas-cli meeting promote --id M --action <uuid> --to wbs|issue`로 WBS/이슈화해 연결.
6. **보고**: meeting id·주제·결정 수·승격 결과 요약.

> 회의록은 외부/대량 기록이므로 **항상 요약을 보여준 뒤** 기록.
