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
    /// 완료 자동 등록 줄 포맷: "- [완료] (종류) 이름 - 담당자, YYYY-MM-DD".
    /// 담당자가 비어있으면 " - 담당자" 부분을 생략. (이슈/WBS 완료 전환 시 공통 사용)
    /// </summary>
    public static string FormatDoneLine(string kind, string name, string? assignee, DateTime date)
    {
        var who = string.IsNullOrWhiteSpace(assignee) ? string.Empty : $" - {assignee.Trim()}";
        return $"- [완료] ({kind}) {name}{who}, {date:yyyy-MM-dd}";
    }

    /// <summary>
    /// 신규 이슈 등록 줄 포맷: "- (이슈) 제목 - 담당자". 담당자가 비어있으면 " - 담당자" 부분을 생략.
    /// 업무일지 '이슈' 필드에 추가(이슈 생성 시).
    /// </summary>
    public static string FormatIssueLine(string title, string? assignee)
    {
        var who = string.IsNullOrWhiteSpace(assignee) ? string.Empty : $" - {assignee.Trim()}";
        return $"- (이슈) {title}{who}";
    }

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
    /// 지정 날짜의 Done 필드 끝에 line 을 추가. 이미 같은 줄이 있으면 skip. (이슈/WBS 완료 전환 시)
    /// </summary>
    public Task AppendDoneAsync(int projectId, DateTime date, string line) =>
        AppendLineAsync(projectId, date, line, LogField.Done);

    /// <summary>
    /// 지정 날짜의 Issues 필드 끝에 line 을 추가. 이미 같은 줄이 있으면 skip. (신규 이슈 등록 시)
    /// </summary>
    public Task AppendIssuesAsync(int projectId, DateTime date, string line) =>
        AppendLineAsync(projectId, date, line, LogField.Issues);

    // Done / Issues 필드 끝에 line 추가 — 없으면 신규 WorkLog 생성, 같은 줄이 이미 있으면 skip.
    private async Task AppendLineAsync(int projectId, DateTime date, string line, LogField field)
    {
        if (string.IsNullOrWhiteSpace(line)) return;
        var d = date.Date;
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
