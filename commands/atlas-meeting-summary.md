---
description: 저장된 Atlas 회의록을 읽어 요약·결정사항·액션아이템을 자동 정리해 다시 채운다
argument-hint: "[회의록 id | 주제 | 비우면 최근 목록]"
allowed-tools: Bash, PowerShell, Read, Write
---

# /atlas-meeting-summary — 회의록 요약·정리(저장본 채우기)

인자: **$ARGUMENTS** — 회의록 id, 주제 키워드, 또는 비우면 최근 목록에서 선택.

이미 작성된 회의록의 **논의 원문(discussion)** 을 읽어 **요약 · 결정사항(decisions) · 액션아이템(action-items)** 을 정리해 **같은 회의록에 다시 채운다**. 앱의 'AI 요약'(로컬 `claude -p` 호출) 을 대체하는 진입점 — 이 Claude 세션의 구독으로 요약한다(추가 요금 없음). 매핑·정책은 `cli-docs/integration.md`, 명령 상세는 `cli-docs/meeting.md`.

> `/atlas-meeting` 은 *대화→신규 회의록 생성*이고, 이 커맨드는 *저장된 회의록→요약 채우기*(get→요약→update) 다.

## 절차

1. **가용성**: `atlas-cli` 없으면 중단(로컬 요약만 제시). 
2. **대상 회의록 선정**:
   - id 면 바로 `atlas-cli meeting get --id N`.
   - 주제/비었으면 프로젝트를 확인(`atlas-cli project list`)한 뒤 `atlas-cli meeting list --project P --limit 10` 로 최근 목록을 보여주고 **어느 회의록인지 사용자에게 확인**(또는 최신 1건).
3. **원문 읽기**: `meeting get --id N` 응답의 `discussion`(논의 원문) + 기존 `decisions` · `actionItems` 를 확인(무엇을 채울지 판단).
4. **요약 작성(한국어)** — 원문 기반으로 3종 산출:
   - **요약 본문**(마크다운): 핵심 논의 주제 · 결정사항 · 후속 액션을 불릿으로.
   - **decisions**: JSON **문자열 배열** — 예 `["A 방식으로 진행(비용·일정 근거)", "B 는 다음 분기로 보류"]`.
   - **action-items**: JSON **객체 배열** — `[{ "id":"<slug>", "content":"...", "assignee":"...", "deadline":"YYYY-MM-DD"(선택) }]`.
   > ⚠️ **표시 정합성**: GUI(회의 상세)는 decisions 가 **JSON 배열**이라야 불릿, action-items 가 **객체 배열**이라야 표로 렌더된다. 마크다운/평문으로 넣지 말 것.
5. **비파괴 병합**:
   - 기존 decisions/action-items 가 **비어 있으면** 그대로 채운다.
   - 이미 값이 있으면 제안본을 보여주고 **병합 / 교체 / 유지** 중 무엇을 할지 사용자에게 확인(수기 입력 보존).
6. **사용자 확인**: 요약(본문·decisions·action-items)을 **먼저 보여주고** 기록 여부 확인(기록성 외부 쓰기).
7. **기록(write-back)** — 세 값을 임시 파일로 쓴 뒤 update. **한글/큰 본문은 인라인 금지**:
   - `discussion.md` = **요약 블록을 원문 위에 프리펜드**: 첫 줄 마커 `## 🤖 AI 요약` + 요약 본문 + `\n\n---\n\n` + 기존 원문. 기존에 `## 🤖 AI 요약` 블록이 있으면 제거 후 재프리펜드(중복 방지 — 앱과 동일 규약이라 앱/스킬 어느 쪽이 갱신해도 하나만 유지).
   - `decisions.json` = 4단계의 JSON 문자열 배열. `actions.json` = 4단계의 JSON 객체 배열.
   - **주의**: `meeting update` 의 `--discussion` · `--decisions` 는 **인라인 문자열만** 받는다(파일 미지원). `--action-items-file` 만 파일/stdin 지원. PowerShell 5.1 은 native 인자의 큰따옴표·한글을 흘리므로, 쓰기는 **Bash 로 `"$(cat 파일)"`** 을 쓰는 게 안전하다:
     ```bash
     atlas-cli meeting update --id N \
       --discussion "$(cat discussion.md)" \
       --decisions  "$(cat decisions.json)" \
       --action-items-file actions.json
     ```
     (PowerShell 로 해야 하면 세션당 `[Console]::OutputEncoding=[Text.Encoding]::UTF8` 후 시도하되, 인라인 실패 시 위 Bash 경로로.)
   - 정확한 플래그는 `atlas-cli meeting update --help`.
8. **승격(선택)**: 후속 작업이 될 ActionItem 은 `atlas-cli meeting promote --id N --action <uuid> --to wbs|issue` 로 WBS/이슈화해 연결.
9. **보고**: 회의록 id · 채운 필드(요약/결정 수/액션 수) · 승격 결과 요약.

> 회의록은 기록성 변경이므로 **항상 요약을 먼저 보여준 뒤** 기록한다. 원문은 지우지 않고 요약을 위에 얹는다.
