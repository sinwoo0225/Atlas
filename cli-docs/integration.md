# integration — Atlas를 업무 시스템 오브 레코드로

> 개발 산출물(일정·repo·문서·변경·이슈·결정)을 Atlas에 기록·연결해 **데이터 연결성**을 확보하는 정책. 어떤 개발 워크플로를 쓰든 적용 가능하며, 커맨드 `/atlas-log`·`/atlas-meeting`·`/atlas-sync`가 이를 실행한다. CLI 상세는 각 기능 문서(`wbs.md`·`devinfo.md`·`changelog.md`·`meeting.md`·`agentic-workflow.md`).

## 가용성 분기 (3-way)

- **Atlas 미설치**(`atlas-cli` 없음): 조용히 skip.
- **설치됨 · 현재 프로젝트 미등록**: `atlas-cli project list --keyword "<repo/제품명>"`로 확인 → 없으면 **사용자에게 "Atlas에 신규 등록하고 진행할지" 확인**(조용히 넘어가지 않음). 승인 → `atlas-cli project create --name "<제품명>"`.
- **설치됨 · 등록됨**: 아래 매핑대로 동기화.

## 매핑 (로컬 산출물 → Atlas)

| 로컬 | Atlas 엔티티 | 명령(요지) |
|---|---|---|
| 작업/개발 일정 | **WbsItem** | `wbs create --name --start [--end] --status Planned\|InProgress\|Done` · `wbs update --status` |
| 프로젝트 git repo | **DevInfo GitRepo** | `devinfo create --type GitRepo --file-path "<repo 절대경로>"` |
| 설계/개발 문서 | **DevInfo Markdown/Link** | `devinfo create --type Markdown --content-file <doc>` (또는 `--type Link --url`) |
| 변경/작업 기록 | **ChangeLog** | `changelog create --content-file --impact Low\|Medium\|High --source-wbs W` |
| 이슈 | **Issue** | `issue create` |
| 대화·최종 결정 | **Meeting(회의록)** | `meeting create --topic --decisions --discussion --action-items-file` |

**연결(링크)**: `wbs link-devinfo --id W --devinfo D` · `wbs link-issue --id W --issue I [--type RelatesTo|Blocks|ParentOf]` · `meeting promote --id M --action <uuid> --to wbs|issue`.

## 연결성 원칙

한 작업(**WBS**)을 중심으로 repo·문서(DevInfo)·변경이력·이슈·회의록이 모두 그 WBS에 링크되어 **`atlas-cli wbs context --id W` 한 번으로 전부 복원**되어야 한다. 이것이 데이터 연결성의 판정 기준.

## 언제 기록하나 (워크플로 무관)

- 작업 **착수** 시: WBS를 InProgress로(없으면 생성), `wbs context`로 관련 자료 수집, repo/문서를 DevInfo로 연결.
- 작업 **완료** 시: `/atlas-log` — WBS Done + `changelog --source-wbs` + 문서 DevInfo 등록/링크 + 이슈 정리.
- **결정/논의**가 오갔을 때: `/atlas-meeting` — 대화·최종 결정을 회의록으로, ActionItem은 승격.

## 값 / 주의

WBS status `Planned|InProgress|Done`(계획 `--start/--end`, 실제 완료 `--completed`) · ChangeLog impact `Low|Medium|High` · DevInfo type `Markdown|File|Link|GitRepo`(GitRepo=Reference 고정) · Meeting category `Internal|External`. 큰 본문·JSON은 인라인 대신 파일/stdin(`--*-file PATH|-`), PowerShell 한글은 세션당 UTF-8.

**쓰기 정책**: 기존 엔티티의 동기화(상태·changelog·링크)는 자동. **신규 프로젝트 등록·회의록 작성·대량 생성은 요약/목록 제시 후 확인**.
