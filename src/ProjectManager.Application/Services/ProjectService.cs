using System.IO.Compression;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;
using ProjectManager.Infrastructure.Config;

namespace ProjectManager.Application.Services;

public class ProjectService(
    IProjectRepository projectRepo,
    IWbsRepository wbsRepo,
    IChangeLogRepository changeLogRepo,
    IMeetingRepository meetingRepo,
    IDevInfoRepository devInfoRepo,
    IIssueRepository issueRepo,
    IWorkLogRepository workLogRepo,
    PathResolver pathResolver)
{
    private static readonly string[] WeekdayLabels = { "월", "화", "수", "목", "금" };
    public async Task<IEnumerable<ProjectDto>> GetAllAsync() =>
        (await projectRepo.GetAllAsync()).Select(ToDto);

    public async Task<ProjectDto?> GetByIdAsync(int id)
    {
        var p = await projectRepo.GetByIdAsync(id);
        return p is null ? null : ToDto(p);
    }

    public async Task<ProjectDashboardDto?> GetDashboardAsync(int id)
    {
        var project = await projectRepo.GetByIdAsync(id);
        if (project is null) return null;

        var now = DateTime.UtcNow;
        // WBS 전체 1회 조회 후 milestones + 위험 신호(overdue/dueSoon) 모두 처리 — N+1 회피.
        var allWbs = (await wbsRepo.GetByProjectAsync(id)).ToList();
        var milestones = allWbs
            .Where(w => w.IsMilestone && w.EndDate >= now)
            .OrderBy(w => w.EndDate)
            .Take(5)
            .Select(WbsToDto);

        var recentChanges = (await changeLogRepo.GetByProjectAsync(id))
            .Take(5)
            .Select(ChangeLogToDto);

        var recentMeetings = (await meetingRepo.GetByProjectAsync(id))
            .Take(5)
            .Select(MeetingToDto);

        var recentDev = (await devInfoRepo.GetByProjectAsync(id))
            .Take(5)
            .Select(DevInfoToDto);

        // 이슈 전체 1회 조회 후 recent + 위험 신호(High Open) 모두 처리.
        var allIssues = (await issueRepo.GetByProjectAsync(id)).ToList();
        var recentIssues = allIssues
            .OrderBy(i => i.Status == IssueStatus.Resolved || i.Status == IssueStatus.Closed ? 1 : 0)
            .ThenByDescending(i => i.CreatedAt)
            .Take(5)
            .Select(IssueToDto)
            .ToList();

        // 위험 신호(D-4):
        // - overdueWbs: EndDate < now AND Status != Done — 가장 오래 지연된 순(EndDate 오름차순)
        // - dueSoonWbs: now <= EndDate <= now+7d AND Status != Done — 가장 가까운 마감 순
        // - highPriorityOpenIssues: Priority=High AND Status in (Open, InProgress) — dueDate 가까운 순(null 마지막)
        // 각 list cap 10. UI 가 섹션당 5건 표시 + "외 N건" 더보기.
        var dueSoonCutoff = now.AddDays(7);
        var overdueWbs = allWbs
            .Where(w => w.EndDate.HasValue && w.EndDate.Value < now && w.Status != WbsStatus.Done)
            .OrderBy(w => w.EndDate)
            .Take(10)
            .Select(WbsToDto)
            .ToList();
        var dueSoonWbs = allWbs
            .Where(w => w.EndDate.HasValue && w.EndDate.Value >= now && w.EndDate.Value <= dueSoonCutoff && w.Status != WbsStatus.Done)
            .OrderBy(w => w.EndDate)
            .Take(10)
            .Select(WbsToDto)
            .ToList();
        var highPriorityOpenIssues = allIssues
            .Where(i => i.Priority == IssuePriority.High && (i.Status == IssueStatus.Open || i.Status == IssueStatus.InProgress))
            .OrderBy(i => i.DueDate ?? DateTime.MaxValue)
            .Take(10)
            .Select(IssueToDto)
            .ToList();
        var riskSignals = new RiskSignalsDto(overdueWbs, dueSoonWbs, highPriorityOpenIssues);

        // 이번 주(월~금) 본 프로젝트 업무일지 5일치
        var weekStart = WorkLogService.StartOfWeek(DateTime.Today);
        var weekLogs = (await workLogRepo.GetByProjectWeekAsync(id, weekStart)).ToList();
        var byDayIndex = weekLogs.ToDictionary(l => (l.Date.Date - weekStart).Days, l => l);
        var days = new List<WeeklyWorkLogDayDto>(5);
        for (var i = 0; i < 5; i++)
        {
            byDayIndex.TryGetValue(i, out var log);
            days.Add(new WeeklyWorkLogDayDto(
                i, WeekdayLabels[i],
                weekStart.AddDays(i).ToString("yyyy-MM-dd"),
                log?.Done ?? string.Empty,
                log?.Plan ?? string.Empty,
                log?.Issues ?? string.Empty));
        }
        var thisWeek = new WeeklyWorkLogProjectDto(id, project.Name, days);

        return new ProjectDashboardDto(
            ToDto(project), milestones, recentChanges, recentMeetings, recentDev,
            recentIssues, thisWeek, riskSignals);
    }

    public async Task<ProjectDto> CreateAsync(CreateProjectDto dto)
    {
        var project = new Project
        {
            Name = dto.Name,
            Description = dto.Description,
            Goal = dto.Goal,
            Status = dto.Status,
            StartDate = dto.StartDate,
            EndDate = dto.EndDate,
            Budget = dto.Budget,
            Participants = dto.Participants,
            Deliverables = dto.Deliverables,
            RelatedLinks = dto.RelatedLinks
        };
        project.FolderPath = pathResolver.GetProjectFolder(project.Name);
        return ToDto(await projectRepo.CreateAsync(project));
    }

    public async Task<ProjectDto?> UpdateAsync(int id, UpdateProjectDto dto)
    {
        var project = await projectRepo.GetByIdAsync(id);
        if (project is null) return null;
        project.Name = dto.Name;
        project.Description = dto.Description;
        project.Goal = dto.Goal;
        project.Status = dto.Status;
        project.StartDate = dto.StartDate;
        project.EndDate = dto.EndDate;
        project.Budget = dto.Budget;
        project.Participants = dto.Participants;
        project.Deliverables = dto.Deliverables;
        project.RelatedLinks = dto.RelatedLinks;
        return ToDto(await projectRepo.UpdateAsync(project));
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var project = await projectRepo.GetByIdAsync(id);
        if (project is null) return false;
        await projectRepo.DeleteAsync(id);
        return true;
    }

    public async Task<(Stream Stream, string FileName)?> CreateBackupAsync(int id)
    {
        var project = await projectRepo.GetByIdAsync(id);
        if (project is null) return null;

        var ms = new MemoryStream();
        using (var archive = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
        {
            // 1) DB 백업 (모든 프로젝트 데이터를 포함, SQLite는 다른 프로세스가 잡고 있을 수 있어 ReadWrite 공유로 연다)
            var dbPath = pathResolver.GetDatabasePath();
            if (File.Exists(dbPath))
            {
                var entry = archive.CreateEntry($"db/projectmanager.db", CompressionLevel.Optimal);
                using var entryStream = entry.Open();
                using var fs = new FileStream(dbPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                await fs.CopyToAsync(entryStream);
            }

            // 2) 프로젝트 폴더 (DevFiles 등)
            // 주의: 만일 FolderPath가 DB가 들어있는 _basePath와 같다면 DB 파일이 중복 포함되거나
            //      다른 프로젝트의 파일까지 포함될 수 있으므로 건너뛴다.
            static string Norm(string p) => Path.TrimEndingDirectorySeparator(Path.GetFullPath(p));
            var dbFullPath = Path.GetFullPath(dbPath);
            var dbDir = Path.GetDirectoryName(dbFullPath);
            var dbDirNorm = string.IsNullOrEmpty(dbDir) ? null : Norm(dbDir);
            var projectFolderFull = string.IsNullOrEmpty(project.FolderPath) ? null : Norm(project.FolderPath);
            var folderUsable = !string.IsNullOrEmpty(projectFolderFull)
                && Directory.Exists(projectFolderFull)
                && !string.Equals(projectFolderFull, dbDirNorm, StringComparison.OrdinalIgnoreCase);

            if (folderUsable)
            {
                var folderName = Path.GetFileName(projectFolderFull!.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
                if (string.IsNullOrEmpty(folderName)) folderName = $"project_{project.Id}";
                foreach (var filePath in Directory.EnumerateFiles(projectFolderFull!, "*", SearchOption.AllDirectories))
                {
                    var rel = Path.GetRelativePath(projectFolderFull!, filePath).Replace('\\', '/');
                    var entryName = $"projectFolder/{folderName}/{rel}";
                    try
                    {
                        var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
                        using var entryStream = entry.Open();
                        using var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                        await fs.CopyToAsync(entryStream);
                    }
                    catch (IOException)
                    {
                        // 파일이 잠겨있는 등 읽을 수 없으면 건너뜀
                    }
                }
            }

            // 3) 메타데이터
            var meta = $"Project: {project.Name}\nId: {project.Id}\nBackupDate: {DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}\n";
            var metaEntry = archive.CreateEntry("backup-info.txt", CompressionLevel.Optimal);
            await using (var metaStream = metaEntry.Open())
            await using (var writer = new StreamWriter(metaStream))
            {
                await writer.WriteAsync(meta);
            }
        }
        ms.Position = 0;

        var safeName = string.Concat((project.Name ?? $"project_{id}").Split(Path.GetInvalidFileNameChars()));
        var fileName = $"{safeName}_backup_{DateTime.UtcNow:yyyyMMdd_HHmmss}.zip";
        return (ms, fileName);
    }

    public static ProjectDto ToDto(Project p) => new(
        p.Id, p.Name, p.Description, p.Goal, p.Status,
        p.StartDate, p.EndDate, p.Budget,
        p.Participants, p.Deliverables, p.RelatedLinks,
        p.FolderPath, p.CreatedAt, p.UpdatedAt);

    internal static WbsItemDto WbsToDto(WbsItem w) => new(
        w.Id, w.ProjectId, w.VersionId, w.ParentId,
        w.Name, w.Assignee, w.StartDate, w.EndDate,
        w.Status, w.IsMilestone, w.Importance, w.Notes,
        w.CreatedAt, w.UpdatedAt, w.SortOrder, null);

    internal static ChangeLogDto ChangeLogToDto(ChangeLog c) => new(
        c.Id, c.ProjectId, c.Date, c.Content, c.Impact,
        c.RelatedDocLinks,
        c.SourceIssueId, c.SourceIssue?.Title,
        c.SourceWbsItemId, c.SourceWbsItem?.Name,
        c.CreatedBy, c.UpdatedBy, c.CreatedAt, c.UpdatedAt);

    internal static MeetingDto MeetingToDto(Meeting m) => new(
        m.Id, m.ProjectId, m.Date, m.StartTime, m.EndTime,
        m.Attendees, m.Topic,
        m.Decisions, m.Discussion, m.ActionItems,
        m.MarkdownPath,
        m.CreatedAt, m.UpdatedAt);

    internal static DevInfoItemDto DevInfoToDto(DevInfoItem d) => new(
        d.Id, d.ProjectId, d.Title, d.Type, d.StorageMode, d.Content,
        d.FilePath, d.Url, d.Tags, d.CreatedAt, d.UpdatedAt);

    internal static IssueDto IssueToDto(Issue i) => new(
        i.Id, i.ProjectId, i.Title, i.Description,
        i.Status, i.Priority,
        i.AssigneeResourceId, i.AssigneeResource?.Name,
        i.DueDate, i.CreatedAt, i.UpdatedAt);
}
