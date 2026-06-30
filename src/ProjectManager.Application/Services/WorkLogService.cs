using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

public class WorkLogService(IWorkLogRepository repo)
{
    public static DateTime StartOfWeek(DateTime date)
    {
        var d = date.Date;
        var diff = ((int)d.DayOfWeek + 6) % 7; // Monday = 0
        return d.AddDays(-diff);
    }

    /// <summary>
    /// 자동 등록 대상 일자 — 주말이면 가장 가까운 평일(금)로 당김.
    /// 업무일지 주간 뷰가 월~금이라 토/일 행은 화면에 안 보이므로, 주말 작업은 금요일 일지에 기록.
    /// </summary>
    public static DateTime ToWeekdayDate(DateTime date)
    {
        var d = date.Date;
        return d.DayOfWeek switch
        {
            DayOfWeek.Saturday => d.AddDays(-1),
            DayOfWeek.Sunday => d.AddDays(-2),
            _ => d,
        };
    }

    /// <summary>
    /// 완료 자동 등록 줄 포맷: "- [완료] (종류) 이름 - 담당자, YYYY-MM-DD".
    /// 담당자가 비어있으면 " - 담당자" 부분을 생략. (평면 호환용 — 계층 등록은 WorkLogMerge 사용)
    /// </summary>
    public static string FormatDoneLine(string kind, string name, string? assignee, DateTime date)
    {
        var who = string.IsNullOrWhiteSpace(assignee) ? string.Empty : $" - {assignee.Trim()}";
        return $"- [완료] ({kind}) {name}{who}, {date:yyyy-MM-dd}";
    }

    /// <summary>
    /// 신규 이슈 등록 줄 포맷: "- [신규] 제목". 업무일지 '이슈' 필드에 추가(이슈 생성 시).
    /// </summary>
    public static string FormatIssueLine(string title, string? assignee) => $"- [신규] {title}";

    public async Task<IEnumerable<WorkLogDto>> GetWeekAsync(int projectId, DateTime weekStart) =>
        (await repo.GetByProjectWeekAsync(projectId, StartOfWeek(weekStart))).Select(ToDto);

    public async Task<WorkLogDto> UpsertAsync(int projectId, DateTime date, UpsertWorkLogDto dto)
    {
        var log = new WorkLog
        {
            ProjectId = projectId,
            Date = date.Date,
            Done = dto.Done ?? string.Empty,
            Plan = dto.Plan ?? string.Empty,
            Issues = dto.Issues ?? string.Empty,
        };
        return ToDto(await repo.UpsertAsync(log));
    }

    private enum LogField { Done, Issues }

    /// <summary>
    /// 지정 날짜의 Done 필드 끝에 line 을 추가. 이미 같은 줄이 있으면 skip. (평면 호환용)
    /// </summary>
    public Task AppendDoneAsync(int projectId, DateTime date, string line) =>
        AppendLineAsync(projectId, date, line, LogField.Done);

    /// <summary>
    /// 지정 날짜의 Issues 필드 끝에 line 을 추가. 이미 같은 줄이 있으면 skip. (신규 이슈 등록 시)
    /// </summary>
    public Task AppendIssuesAsync(int projectId, DateTime date, string line) =>
        AppendLineAsync(projectId, date, line, LogField.Issues);

    /// <summary>
    /// 당일 Done 필드에 작업/이슈 한 줄을 계층형으로 upsert. (WBS/이슈 시작·완료 전환 시)
    /// ancestorNames 가 있으면 최상위 부모부터 2칸씩 들여쓴 컨텍스트 줄 아래에 리프를 배치.
    /// 같은 항목의 [시작] 줄이 이미 있으면 [완료]로 교체(동일 결과면 저장 skip).
    /// </summary>
    public async Task UpsertDoneHierarchicalAsync(
        int projectId, DateTime date, IReadOnlyList<string> ancestorNames,
        string kind, string name, string? assignee, WorkLogMerge.DoneMarker marker)
    {
        if (string.IsNullOrWhiteSpace(name)) return;
        var d = ToWeekdayDate(date); // 주말이면 금요일 일지에 기록
        var existing = await repo.GetByProjectDateAsync(projectId, d);
        if (existing is null)
        {
            await repo.UpsertAsync(new WorkLog
            {
                ProjectId = projectId, Date = d,
                Done = WorkLogMerge.UpsertDone(string.Empty, ancestorNames, kind, name, assignee, d, marker),
                Plan = string.Empty,
                Issues = string.Empty,
            });
            return;
        }
        var current = existing.Done ?? string.Empty;
        var next = WorkLogMerge.UpsertDone(current, ancestorNames, kind, name, assignee, d, marker);
        if (next == current) return; // 멱등 no-op — UpdatedAt 불변
        existing.Done = next;
        await repo.UpsertAsync(existing);
    }

    // Done / Issues 필드 끝에 line 추가 — 없으면 신규 WorkLog 생성, 같은 줄이 이미 있으면 skip.
    private async Task AppendLineAsync(int projectId, DateTime date, string line, LogField field)
    {
        if (string.IsNullOrWhiteSpace(line)) return;
        var d = ToWeekdayDate(date); // 주말이면 금요일 일지에 기록
        var existing = await repo.GetByProjectDateAsync(projectId, d);
        if (existing is null)
        {
            await repo.UpsertAsync(new WorkLog
            {
                ProjectId = projectId, Date = d,
                Done = field == LogField.Done ? line : string.Empty,
                Plan = string.Empty,
                Issues = field == LogField.Issues ? line : string.Empty,
            });
            return;
        }
        var current = (field == LogField.Done ? existing.Done : existing.Issues) ?? string.Empty;
        var lines = current.Replace("\r\n", "\n").Split('\n');
        var trimmed = line.Trim();
        foreach (var existingLine in lines)
            if (existingLine.Trim() == trimmed) return;
        var next = string.IsNullOrWhiteSpace(current) ? line : current.TrimEnd() + "\n" + line;
        if (field == LogField.Done) existing.Done = next; else existing.Issues = next;
        await repo.UpsertAsync(existing);
    }

    internal static WorkLogDto ToDto(WorkLog w) =>
        new(w.Id, w.ProjectId, w.Date, w.Done, w.Plan, w.Issues, w.CreatedAt, w.UpdatedAt);
}

// 업무일지 자동 등록 범위 게이트 (설정 '작성 범위'). 자동 일지·진행항목 자동작성에서 공통 사용.
public static class WorkLogScopeGate
{
    // scope=mine 이면 actor 가 담당(콤마 분리 토큰 정확 일치, 대소문자 무시)일 때만 true.
    // 전체(MineOnly=false) 또는 actor 미상(CLI 등)이면 항상 true(게이트 무력화 → 기존 동작).
    public static bool ShouldAutoLog(IWorkLogScopeAccessor scope, IActorAccessor actor, string? assignee)
    {
        if (!scope.MineOnly) return true;
        var name = actor.GetActor();
        if (string.IsNullOrWhiteSpace(name)) return true;
        if (string.IsNullOrWhiteSpace(assignee)) return false;
        return assignee
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Any(p => string.Equals(p, name, StringComparison.OrdinalIgnoreCase));
    }
}

/// <summary>
/// 업무일지 Done(마크다운) 텍스트에 작업/이슈 줄을 계층형으로 upsert 하는 순수 함수.
/// (문자열 in → 문자열 out, I/O 없음 — 단위테스트 용이)
/// </summary>
public static class WorkLogMerge
{
    public enum DoneMarker { Started, InProgress, Waiting, Completed } // [시작] / [진행] / [대기] / [완료]

    private static string MarkerText(DoneMarker m) => m switch
    {
        DoneMarker.Completed => "[완료]",
        DoneMarker.InProgress => "[진행]",
        DoneMarker.Waiting => "[대기]",
        _ => "[시작]",
    };

    // leaf 식별·교체용 마커 목록(StripMarker 가 선두에서 제거). 새 마커 추가 시 여기에 등록.
    private static readonly string[] LeafMarkers = { "[완료]", "[진행]", "[대기]", "[시작]" };

    private const int IndentPerLevel = 2; // 에디터 Tab(textareaTab.ts) 및 CommonMark 중첩과 일치

    /// <summary>
    /// done 에 한 줄을 계층형으로 upsert 하고 새 Done 문자열을 반환.
    /// ancestorNames: 최상위→직속 부모 순. 비면 평면(이슈/루트 리프 → 들여쓰기 0, 현행 출력과 동일).
    /// </summary>
    public static string UpsertDone(
        string done, IReadOnlyList<string> ancestorNames,
        string kind, string name, string? assignee, DateTime date, DoneMarker marker)
    {
        ancestorNames ??= [];
        var leafDepth = ancestorNames.Count;
        var leafIndent = leafDepth * IndentPerLevel;
        var token = $"({kind}) {name}";
        var leafLine = RenderLeaf(leafDepth, marker, kind, name, assignee, date);

        // 빈 Done — 부모 컨텍스트 + 리프 블록을 그대로.
        if (string.IsNullOrWhiteSpace(done))
        {
            var fresh = new List<string>(leafDepth + 1);
            for (var k = 0; k < leafDepth; k++) fresh.Add(RenderContext(k, ancestorNames[k]));
            fresh.Add(leafLine);
            return string.Join("\n", fresh);
        }

        var lines = done.Replace("\r\n", "\n").Replace("\r", "\n").Split('\n').ToList();

        // 1) 부모 체인 해석 — 들여쓰기 워크.
        var searchStart = 0;
        var searchEnd = lines.Count;
        var firstMissing = leafDepth; // sentinel: 전부 매칭
        for (var k = 0; k < leafDepth; k++)
        {
            var target = k * IndentPerLevel;
            var found = -1;
            for (var idx = searchStart; idx < searchEnd; idx++)
            {
                var line = lines[idx];
                if (IsBlank(line)) continue;
                var ind = LeadingSpaces(line);
                if (ind < target) break; // dedent → 블록 경계
                if (ind == target && IsListItem(line) && ContentOf(line).TrimEnd() == ancestorNames[k])
                {
                    found = idx;
                    break;
                }
            }
            if (found < 0) { firstMissing = k; break; }
            searchStart = found + 1;
            searchEnd = EndOfBlock(lines, found, target, searchEnd);
        }

        if (firstMissing == leafDepth)
        {
            // 부모 전부 매칭(또는 leafDepth==0). childRegion = [searchStart, searchEnd).
            var leafIdx = -1;
            for (var idx = searchStart; idx < searchEnd; idx++)
            {
                var line = lines[idx];
                if (IsBlank(line)) continue;
                var ind = LeadingSpaces(line);
                if (ind < leafIndent) break;
                if (ind == leafIndent && IsListItem(line) && TokenMatch(line, token))
                {
                    leafIdx = idx;
                    break;
                }
            }
            if (leafIdx >= 0)
                lines[leafIdx] = leafLine; // 시작→완료 스왑 / 멱등 교체
            else
                lines.Insert(TrimTrailingBlanks(lines, searchEnd, searchStart), leafLine);
        }
        else
        {
            // 부모 일부 누락 — m..leaf 컨텍스트 + 리프를 매칭된 최심 부모 아래(혹은 문서 끝)에 삽입.
            var block = new List<string>(leafDepth - firstMissing + 1);
            for (var k = firstMissing; k < leafDepth; k++) block.Add(RenderContext(k, ancestorNames[k]));
            block.Add(leafLine);
            lines.InsertRange(TrimTrailingBlanks(lines, searchEnd, searchStart), block);
        }

        return string.Join("\n", lines);
    }

    private static string RenderContext(int depth, string name) =>
        new string(' ', depth * IndentPerLevel) + "- " + name;

    private static string RenderLeaf(int depth, DoneMarker marker, string kind, string name, string? assignee, DateTime date)
    {
        var indent = new string(' ', depth * IndentPerLevel);
        var who = string.IsNullOrWhiteSpace(assignee) ? string.Empty : $" - {assignee.Trim()}";
        return $"{indent}- {MarkerText(marker)} ({kind}) {name}{who}, {date:yyyy-MM-dd}";
    }

    private static int LeadingSpaces(string s)
    {
        var n = 0;
        while (n < s.Length && s[n] == ' ') n++;
        return n;
    }

    private static bool IsBlank(string s) => string.IsNullOrWhiteSpace(s);

    private static bool IsListItem(string s)
    {
        var t = s.TrimStart(' ');
        return t == "-" || t.StartsWith("- ");
    }

    // "- " 뒤 내용(또는 "-" 면 ""). IsListItem 가 true 인 줄에만 사용.
    private static string ContentOf(string s)
    {
        var t = s.TrimStart(' ');
        return t.Length >= 2 ? t[2..] : string.Empty;
    }

    // 선두 [완료]/[시작] 마커 제거 후 나머지.
    private static string StripMarker(string content)
    {
        foreach (var marker in LeafMarkers)
            if (content.StartsWith(marker))
                return content[marker.Length..].TrimStart(' ');
        return content;
    }

    // 리프 식별 — 마커·담당자·날짜 무시. token 경계 엄격(부분 이름 오매칭 방지).
    private static bool TokenMatch(string line, string token)
    {
        var r = StripMarker(ContentOf(line));
        return r == token || r.StartsWith(token + ", ") || r.StartsWith(token + " - ");
    }

    // found 다음부터 bound 까지, indent <= ownerIndent 인 첫 비공백 줄 인덱스(없으면 bound) = 블록 끝(exclusive).
    private static int EndOfBlock(List<string> lines, int found, int ownerIndent, int bound)
    {
        for (var idx = found + 1; idx < bound; idx++)
        {
            if (IsBlank(lines[idx])) continue;
            if (LeadingSpaces(lines[idx]) <= ownerIndent) return idx;
        }
        return bound;
    }

    // end 직전의 공백 줄들을 건너뛰어 삽입 위치를 마지막 비공백 줄 바로 뒤로(단 start 아래로는 안 내려감).
    private static int TrimTrailingBlanks(List<string> lines, int end, int start)
    {
        while (end - 1 >= start && IsBlank(lines[end - 1])) end--;
        return end;
    }

    /// <summary>
    /// 주간 최종 상태(F7) — 여러 날(월→금)의 Done 마크다운을 작업별 최종 상태 한 블록으로 합친다.
    /// 리프(마커 줄)는 "(종류) 이름[ - 담당자]" 키로 dedup, 가장 나중 줄 채택(시작→완료가 최종 반영).
    /// 부모 컨텍스트/자유 텍스트 줄은 (들여쓰기+내용) 으로 dedup. 모두 최초 등장 순서 유지.
    /// </summary>
    public static string FoldFinalState(IReadOnlyList<string> dailyDoneTexts)
    {
        var result = new List<string>();
        var leafIndex = new Dictionary<string, int>();
        var otherSeen = new HashSet<string>();
        foreach (var text in dailyDoneTexts)
        {
            if (string.IsNullOrWhiteSpace(text)) continue;
            foreach (var line in text.Replace("\r\n", "\n").Replace("\r", "\n").Split('\n'))
            {
                if (IsBlank(line)) continue;
                if (IsListItem(line))
                {
                    var content = ContentOf(line);
                    if (LeafMarkers.Any(content.StartsWith))
                    {
                        var key = LeafKey(line);
                        if (leafIndex.TryGetValue(key, out var idx)) result[idx] = line; // 최신으로 교체
                        else { leafIndex[key] = result.Count; result.Add(line); }
                        continue;
                    }
                    if (otherSeen.Add(LeadingSpaces(line) + ":" + content.TrimEnd())) result.Add(line);
                }
                else if (otherSeen.Add("free:" + line.Trim()))
                {
                    result.Add(line);
                }
            }
        }
        return string.Join("\n", result);
    }

    /// <summary>여러 텍스트의 비공백 줄을 정확 일치로 dedup 해 합친다(이슈 등 평면 필드용).</summary>
    public static string FoldFlatLines(IEnumerable<string> texts)
    {
        var seen = new HashSet<string>();
        var result = new List<string>();
        foreach (var text in texts)
        {
            if (string.IsNullOrWhiteSpace(text)) continue;
            foreach (var line in text.Replace("\r\n", "\n").Replace("\r", "\n").Split('\n'))
            {
                if (IsBlank(line)) continue;
                if (seen.Add(line.Trim())) result.Add(line);
            }
        }
        return string.Join("\n", result);
    }

    // 리프 dedup 키 — 마커 제거 + 끝의 ", yyyy-MM-dd" 제거 → "(종류) 이름[ - 담당자]".
    private static string LeafKey(string line)
    {
        var content = StripMarker(ContentOf(line)).TrimEnd();
        var ci = content.LastIndexOf(", ", StringComparison.Ordinal);
        if (ci >= 0 && IsDateSuffix(content, ci + 2)) content = content[..ci];
        return content.Trim();
    }

    // start 위치부터 끝까지가 정확히 yyyy-MM-dd(10자) 형식인지.
    private static bool IsDateSuffix(string s, int start)
    {
        if (s.Length - start != 10) return false;
        for (var i = start; i < s.Length; i++)
        {
            var rel = i - start;
            if (rel == 4 || rel == 7) { if (s[i] != '-') return false; }
            else if (!char.IsDigit(s[i])) return false;
        }
        return true;
    }
}
