---
description: 설치된 Atlas 버전을 확인해 atlas 스킬·커맨드를 갱신하고 신규 CLI verb·MCP 도구를 보고
argument-hint: "[--force]"
allowed-tools: Bash, PowerShell, Read, Write, Edit
---

# /atlas-sync — Atlas 도구 최신화

Atlas는 빠르게 진화하므로 `~/.claude`에 설치된 atlas 스킬·커맨드가 stale해질 수 있다. 설치본 버전을 확인해 갱신하고, 지난 동기화 이후 새로 생긴 CLI verb / MCP 도구를 알려준다.

## 절차

1. **설치 버전 확인**: `atlas-cli --version`(있으면 이 값). 없으면 exe FileVersion(PowerShell `(Get-Item (Get-Command atlas-cli).Source).VersionInfo.FileVersion`, Store 별칭이면 비어 있을 수 있으니 `C:\Users\<user>\AppData\Local\Programs\Atlas\Atlas-Cli.exe` 폴백). `atlas-cli`를 못 찾으면 Atlas 미설치로 보고 중단.
2. **베이스라인 비교**: `~/.claude/skills/atlas/.installed-version`(JSON `{version, commandIndex}`). 없으면 최초 동기화. 버전 동일하고 `--force` 아니면 "최신(vX.Y.Z)"만 보고 후 종료.
3. **갱신**: `atlas-cli skill install --force` — atlas 스킬(`~/.claude/skills/atlas`)과 atlas 커맨드(`~/.claude/commands/atlas-*.md`)를 최신본으로 재설치(다른 커맨드는 보존).
4. **신규 diff**: 갱신 전/후 SKILL.md의 "명령 인덱스"(또는 `atlas-cli --help` 최상위 verb)를 비교해 추가된 verb/action 목록화.
5. **MCP 도구**: 신규 `atlas_*` 도구는 재등록 후 노출 — 필요 시 `claude mcp add --scope user atlas atlas-mcp`(cli-docs/mcp.md) 재실행/재시작 안내.
6. **베이스라인 저장**: `~/.claude/skills/atlas/.installed-version`에 새 `{version, commandIndex}`.
7. **보고**: `vOLD → vNEW`, 새 verb/도구, 조치 필요 여부 요약.
