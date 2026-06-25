using System.IO.Compression;
using Microsoft.EntityFrameworkCore;
using ProjectManager.Application.Search;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;
using ProjectManager.Infrastructure.Config;
using ProjectManager.Infrastructure.Persistence;

namespace ProjectManager.Application.Services;

public class ProjectService(
    IProjectRepository projectRepo,
    IWbsRepository wbsRepo,
    IChangeLogRepository changeLogRepo,
    IMeetingRepository meetingRepo,
    IDevInfoRepository devInfoRepo,
    IIssueRepository issueRepo,
    IWorkLogRepository workLogRepo,
    PathResolver pathResolver,
    AppDbContext db,
    SearchService search)
{
    private static readonly string[] WeekdayLabels = { "월", "화", "수", "목", "금" };
    public async Task<IEnumerable<ProjectDto>> GetAllAsync(ProjectListFilter? filter = null) =>
        (await projectRepo.GetAllAsync(filter)).Select(ToDto);

    public async Task<ProjectDto?> GetByIdAsync(int id)
    {
        var p = await projectRepo.GetByIdAsync(id);
        return p is null ? null : ToDto(p);
    }

    public async Task<ProjectDashboardDto?> GetDashboardAsync(int id)
    {
        var project = await projectRepo.GetByIdAsync(id);
        if (project is null) return null;

        var today = DateTime.Today;
        // WBS 전체 1회 조회 후 milestones + 위험 신호(overdue/dueSoon) 모두 처리 — N+1 회피.
        var allWbs = (await wbsRepo.GetByProjectAsync(id)).ToList();
        // 자식을 가진 부모 WBS 는 그루핑 역할 — 항목 목록·집계에서 제외(leaf only).
        var parentIds = allWbs.Where(w => w.ParentId.HasValue).Select(w => w.ParentId!.Value).ToHashSet();
        var milestones = allWbs
            .Where(w => w.IsMilestone && !parentIds.Contains(w.Id) && w.EndDate.HasValue && w.EndDate.Value.Date >= today)
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
        // - overdueWbs: EndDate.Date < today AND Status != Done — 가장 오래 지연된 순(EndDate 오름차순). 오늘 마감은 지연 아님(임박).
        // - dueSoonWbs: today <= EndDate.Date <= today+7d AND Status != Done — 가장 가까운 마감 순
        // - highPriorityOpenIssues: Priority=High AND Status in (Open, InProgress) — dueDate 가까운 순(null 마지막)
        // 각 list cap 10. UI 가 섹션당 5건 표시 + "외 N건" 더보기. 부모(자식 보유) WBS 는 제외(leaf only).
        var dueSoonCutoff = today.AddDays(7);
        var overdueWbs = allWbs
            .Where(w => !parentIds.Contains(w.Id) && w.EndDate.HasValue && w.EndDate.Value.Date < today && w.Status != WbsStatus.Done)
            .OrderBy(w => w.EndDate)
            .Take(10)
            .Select(WbsToDto)
            .ToList();
        var dueSoonWbs = allWbs
            .Where(w => !parentIds.Contains(w.Id) && w.EndDate.HasValue && w.EndDate.Value.Date >= today && w.EndDate.Value.Date <= dueSoonCutoff && w.Status != WbsStatus.Done)
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
            Category = dto.Category ?? string.Empty,
            Description = dto.Description,
            Goal = dto.Goal,
            Status = dto.Status,
            StartDate = dto.StartDate,
            EndDate = dto.EndDate,
            Budget = dto.Budget,
            Participants = dto.Participants,
            Deliverables = dto.Deliverables,
            RelatedLinks = dto.RelatedLinks,
            GitRepoPath = dto.GitRepoPath ?? string.Empty,
            CompletedDate = dto.CompletedDate ?? (dto.Status == ProjectStatus.Done ? DateTime.Today : null)
        };
        project.FolderPath = pathResolver.GetProjectFolder(project.Name);
        return ToDto(await projectRepo.CreateAsync(project));
    }

    public async Task<ProjectDto?> UpdateAsync(int id, UpdateProjectDto dto)
    {
        var project = await projectRepo.GetByIdAsync(id);
        if (project is null) return null;
        var wasDone = project.Status == ProjectStatus.Done;
        project.Name = dto.Name;
        project.Category = dto.Category ?? string.Empty;
        project.Description = dto.Description;
        project.Goal = dto.Goal;
        project.Status = dto.Status;
        project.StartDate = dto.StartDate;
        project.EndDate = dto.EndDate;
        project.Budget = dto.Budget;
        project.Participants = dto.Participants;
        project.Deliverables = dto.Deliverables;
        project.RelatedLinks = dto.RelatedLinks;
        project.GitRepoPath = dto.GitRepoPath ?? string.Empty;
        // 완료일(실적): 클라값 우선. Done 진입 시 없으면 오늘, 벗어나면 클리어.
        project.CompletedDate = dto.CompletedDate;
        if (!wasDone && dto.Status == ProjectStatus.Done && project.CompletedDate is null)
            project.CompletedDate = DateTime.Today;
        else if (wasDone && dto.Status != ProjectStatus.Done)
            project.CompletedDate = null;
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
        p.Id, p.Name, p.Category, p.Description, p.Goal, p.Status,
        p.StartDate, p.EndDate, p.Budget,
        p.Participants, p.Deliverables, p.RelatedLinks,
        p.FolderPath, p.GitRepoPath, p.CreatedAt, p.UpdatedAt, p.CompletedDate);

    internal static WbsItemDto WbsToDto(WbsItem w) => new(
        w.Id, w.ProjectId, w.VersionId, w.ParentId,
        w.Name, w.Assignee, w.StartDate, w.EndDate,
        w.Status, w.IsMilestone, w.Importance, w.Notes,
        w.CreatedAt, w.UpdatedAt, w.SortOrder, w.CompletedDate,
        w.EstimateHours, w.EstimateHours,
        w.BaselineStart, w.BaselineEnd, null);

    internal static ChangeLogDto ChangeLogToDto(ChangeLog c) => new(
        c.Id, c.ProjectId, c.Date, c.Content, c.Impact,
        c.RelatedDocLinks,
        c.SourceIssueId, c.SourceIssue?.Title,
        c.SourceWbsItemId, c.SourceWbsItem?.Name,
        c.CreatedBy, c.UpdatedBy, c.CreatedAt, c.UpdatedAt);

    internal static MeetingDto MeetingToDto(Meeting m) => new(
        m.Id, m.ProjectId, m.Date, m.StartTime, m.EndTime,
        m.Category,
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
        i.DueDate, i.OccurredOn, i.CreatedAt, i.UpdatedAt, i.ResolvedDate,
        i.Category, i.CustomFieldsJson);

    // 이슈 리스트 커스텀 컬럼 정의(Project.IssueCustomColumnsJson) — raw JSON 배열 passthrough.
    // 정의 편집은 프로젝트 다른 필드와 분리해 별도 엔드포인트로 처리(전체 프로젝트 페이로드/동시성 충돌 회피).
    public async Task<string> GetIssueColumnsAsync(int projectId)
    {
        var p = await projectRepo.GetByIdAsync(projectId);
        return string.IsNullOrWhiteSpace(p?.IssueCustomColumnsJson) ? "[]" : p!.IssueCustomColumnsJson;
    }

    public async Task<bool> SetIssueColumnsAsync(int projectId, string json)
    {
        var p = await projectRepo.GetByIdAsync(projectId);
        if (p is null) return false;
        p.IssueCustomColumnsJson = json ?? string.Empty;
        await projectRepo.UpdateAsync(p);
        return true;
    }

    // ============== Import (백업 zip → 단일 프로젝트 머지) ==============
    // 백업 zip 안 db/projectmanager.db 에서 import 가능한 프로젝트 목록 미리보기.
    // 반환 null = zip 안에 백업 db 가 없거나 깨짐.
    public async Task<List<ImportPreviewItemDto>?> ListImportPreviewAsync(Stream zipStream, CancellationToken ct = default)
    {
        var extract = await ExtractZipToTempAsync(zipStream, ct);
        if (extract is null) return null;
        try
        {
            await EnsureBackupSchemaAsync(extract.BackupDbPath, ct);
            using var backupDb = OpenBackupContext(extract.BackupDbPath);
            var projects = await backupDb.Projects.AsNoTracking()
                .OrderByDescending(p => p.UpdatedAt)
                .ToListAsync(ct);
            var result = new List<ImportPreviewItemDto>(projects.Count);
            foreach (var p in projects)
            {
                var issueCount = await backupDb.Issues.AsNoTracking().CountAsync(x => x.ProjectId == p.Id, ct);
                var wbsCount = await backupDb.WbsItems.AsNoTracking().CountAsync(x => x.ProjectId == p.Id, ct);
                var meetingCount = await backupDb.Meetings.AsNoTracking().CountAsync(x => x.ProjectId == p.Id, ct);
                result.Add(new ImportPreviewItemDto(
                    p.Id, p.Name, p.Description, p.CreatedAt, p.UpdatedAt,
                    issueCount, wbsCount, meetingCount));
            }
            return result;
        }
        finally
        {
            TryDeleteDirectory(extract.TempRoot);
        }
    }

    // 백업 zip 의 특정 프로젝트 한 개를 현재 DB 에 새 프로젝트로 머지.
    // 반환 null = 지정된 sourceProjectId 가 백업에 없음.
    // 리소스 마스터 데이터는 import 하지 않고, Issue 의 AssigneeResourceId 는 Email 매칭으로만 보존 시도.
    public async Task<ImportProjectResultDto?> ImportProjectAsync(
        Stream zipStream, int sourceProjectId, CancellationToken ct = default)
    {
        var extract = await ExtractZipToTempAsync(zipStream, ct);
        if (extract is null)
            throw new InvalidOperationException("백업 zip 안에서 db/projectmanager.db 를 찾을 수 없습니다.");
        try
        {
            await EnsureBackupSchemaAsync(extract.BackupDbPath, ct);
            using var backupDb = OpenBackupContext(extract.BackupDbPath);
            var srcProject = await backupDb.Projects.AsNoTracking()
                .FirstOrDefaultAsync(p => p.Id == sourceProjectId, ct);
            if (srcProject is null) return null;

            var warnings = new List<string>();
            var (resourceIdMap, resourceWarnings) = await BuildResourceMapAsync(backupDb, ct);
            warnings.AddRange(resourceWarnings);

            string? createdFolder = null;
            ImportContext.IsImporting = true;
            try
            {
                using var tx = await db.Database.BeginTransactionAsync(ct);
                try
                {
                    // 1) Project 한 행 — 이름 충돌 시 timestamp suffix, 폴더는 빈 폴더 보장.
                    var (newProject, folderPath) = await CreateImportedProjectAsync(srcProject, ct);
                    createdFolder = folderPath;

                    // 2) WbsVersion
                    var versionIdMap = new Dictionary<int, int>();
                    var versionsImported = await ImportWbsVersionsAsync(
                        backupDb, sourceProjectId, newProject.Id, versionIdMap, ct);

                    // 3) WbsItem (2-pass: ParentId=null 로 insert 후 ParentId 갱신)
                    var wbsIdMap = new Dictionary<int, int>();
                    var wbsImported = await ImportWbsItemsAsync(
                        backupDb, sourceProjectId, newProject.Id, versionIdMap, wbsIdMap, ct);

                    // 4) Issue — AssigneeResourceId 는 Email 매핑 결과로 치환.
                    var issueIdMap = new Dictionary<int, int>();
                    var (issuesImported, assigneeMatched, assigneeMissing) = await ImportIssuesAsync(
                        backupDb, sourceProjectId, newProject.Id, resourceIdMap, issueIdMap, ct);

                    // 5) Meeting — MarkdownPath 절대경로 rewrite.
                    var meetingsImported = await ImportMeetingsAsync(
                        backupDb, sourceProjectId, newProject, ct);

                    // 6) DevInfoItem — FilePath 절대경로 rewrite (Copy 모드만).
                    var (devInfoImported, devWarnings) = await ImportDevInfoAsync(
                        backupDb, sourceProjectId, newProject, ct);
                    warnings.AddRange(devWarnings);

                    // 7) WorkLog — Unique(ProjectId, Date) 는 새 ProjectId 라 충돌 없음.
                    var workLogsImported = await ImportWorkLogsAsync(
                        backupDb, sourceProjectId, newProject.Id, ct);

                    // 8) ChangeLog — SourceIssue/SourceWbs FK 재매핑.
                    var changeLogsImported = await ImportChangeLogsAsync(
                        backupDb, sourceProjectId, newProject.Id, issueIdMap, wbsIdMap, ct);

                    // 9) IssueWbsLink — 양측 FK 재매핑, 한쪽이라도 매핑 실패면 skip.
                    var (linksImported, linkWarnings) = await ImportIssueWbsLinksAsync(
                        backupDb, sourceProjectId, issueIdMap, wbsIdMap, ct);
                    warnings.AddRange(linkWarnings);

                    // 10) 프로젝트 폴더 복사 (DB commit 전 — 파일 실패 시 DB 도 함께 롤백)
                    if (extract.ProjectFolderDir is not null)
                    {
                        CopyDirectoryContents(extract.ProjectFolderDir, folderPath);
                    }
                    else
                    {
                        warnings.Add("백업에 프로젝트 폴더가 포함되어 있지 않아 첨부 파일은 가져오지 않았습니다.");
                    }

                    // 11) 요약 ActivityLog 1행 (인터셉터 가드 중이라 자식 Create 는 안 쌓임)
                    db.ActivityLogs.Add(new ActivityLog
                    {
                        ProjectId = newProject.Id,
                        EntityType = "Project",
                        EntityId = newProject.Id,
                        EntityTitle = newProject.Name,
                        Action = ActivityAction.Create,
                        Actor = newProject.CreatedBy ?? string.Empty,
                        Timestamp = DateTime.UtcNow,
                        ChangesJson = null,
                    });
                    await db.SaveChangesAsync(ct);

                    await tx.CommitAsync(ct);

                    // commit 후 검색 인덱스 1회 rebuild (인터셉터 가드 중이라 자동 동기화 안 됨)
                    try { await search.RebuildAllAsync(db, ct); }
                    catch (Exception ex) { Console.Error.WriteLine("[import] search rebuild failed: " + ex.Message); }

                    return new ImportProjectResultDto(
                        newProject.Id, newProject.Name, newProject.FolderPath,
                        issuesImported, assigneeMatched, assigneeMissing,
                        wbsImported, versionsImported,
                        meetingsImported, devInfoImported,
                        workLogsImported, changeLogsImported, linksImported,
                        warnings);
                }
                catch
                {
                    try { await tx.RollbackAsync(CancellationToken.None); } catch { }
                    if (createdFolder is not null) TryDeleteDirectory(createdFolder);
                    throw;
                }
            }
            finally
            {
                ImportContext.IsImporting = false;
            }
        }
        finally
        {
            TryDeleteDirectory(extract.TempRoot);
        }
    }

    // ---- import 헬퍼들 ----

    private record ZipExtract(string TempRoot, string BackupDbPath, string? ProjectFolderDir);

    // zip 을 임시 폴더에 풀고 (db 파일, 프로젝트 폴더 경로) 를 반환. db 가 없으면 null.
    private static async Task<ZipExtract?> ExtractZipToTempAsync(Stream zipStream, CancellationToken ct)
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), "atlas-import-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempRoot);
        try
        {
            using var archive = new ZipArchive(zipStream, ZipArchiveMode.Read, leaveOpen: true);
            foreach (var entry in archive.Entries)
            {
                if (string.IsNullOrEmpty(entry.Name)) continue; // 디렉토리 entry skip
                var target = Path.GetFullPath(Path.Combine(tempRoot, entry.FullName));
                // zip-slip 방어
                if (!target.StartsWith(Path.GetFullPath(tempRoot) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                    continue;
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                await using var ts = File.Create(target);
                await using var es = entry.Open();
                await es.CopyToAsync(ts, ct);
            }

            var backupDbPath = Path.Combine(tempRoot, "db", "projectmanager.db");
            if (!File.Exists(backupDbPath))
            {
                TryDeleteDirectory(tempRoot);
                return null;
            }

            // projectFolder/<one-folder>/ 내부를 잡는다. 폴더가 없으면 null.
            var projectFolderRoot = Path.Combine(tempRoot, "projectFolder");
            string? projectFolderDir = null;
            if (Directory.Exists(projectFolderRoot))
            {
                projectFolderDir = Directory.EnumerateDirectories(projectFolderRoot).FirstOrDefault();
            }

            return new ZipExtract(tempRoot, backupDbPath, projectFolderDir);
        }
        catch
        {
            TryDeleteDirectory(tempRoot);
            throw;
        }
    }

    // 백업 DB 가 더 옛 스키마면 임시 위치에서 Migrate 로 현재 스키마까지 끌어올림.
    // 실패하면 "지원되지 않는 백업 버전" 으로 통일된 예외.
    private static async Task EnsureBackupSchemaAsync(string backupDbPath, CancellationToken ct)
    {
        try
        {
            var opts = new DbContextOptionsBuilder<AppDbContext>()
                .UseSqlite($"Data Source={backupDbPath}")
                .Options;
            using var migrationDb = new AppDbContext(opts);
            await migrationDb.Database.MigrateAsync(ct);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException(
                "백업 DB 스키마를 현재 버전으로 끌어올리지 못했습니다. 백업이 더 신버전에서 만들어졌거나 손상되었을 수 있습니다.", ex);
        }
    }

    private static AppDbContext OpenBackupContext(string backupDbPath)
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite($"Data Source={backupDbPath}")
            .Options;
        return new AppDbContext(opts);
    }

    // 백업측 Resource.Id → 현재 DB Resource.Id 매핑. Email 매칭만 사용.
    // 매칭 실패면 dict 에 키 없음 (호출자는 null 로 처리).
    private async Task<(Dictionary<int, int> Map, List<string> Warnings)> BuildResourceMapAsync(
        AppDbContext backupDb, CancellationToken ct)
    {
        var warnings = new List<string>();
        var map = new Dictionary<int, int>();

        var currentResources = await db.Resources.AsNoTracking()
            .Select(r => new { r.Id, r.Email }).ToListAsync(ct);
        var currentByEmail = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var duplicateEmails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var r in currentResources)
        {
            var key = (r.Email ?? string.Empty).Trim().ToLowerInvariant();
            if (string.IsNullOrEmpty(key)) continue;
            if (currentByEmail.ContainsKey(key))
                duplicateEmails.Add(key);
            else
                currentByEmail[key] = r.Id;
        }
        foreach (var dup in duplicateEmails)
            warnings.Add($"현재 DB 에 동일 이메일을 가진 리소스가 둘 이상 있습니다 ('{dup}'). 첫 번째 행으로 매핑됩니다.");

        var backupResources = await backupDb.Resources.AsNoTracking()
            .Select(r => new { r.Id, r.Email }).ToListAsync(ct);
        foreach (var br in backupResources)
        {
            var key = (br.Email ?? string.Empty).Trim().ToLowerInvariant();
            if (string.IsNullOrEmpty(key)) continue;
            if (currentByEmail.TryGetValue(key, out var currentId))
                map[br.Id] = currentId;
        }
        return (map, warnings);
    }

    private async Task<(Project Project, string FolderPath)> CreateImportedProjectAsync(
        Project src, CancellationToken ct)
    {
        // 이름 충돌 시 timestamp suffix (사용자 식별 가능). 그래도 충돌이면 _2, _3.
        var newName = src.Name ?? string.Empty;
        if (await db.Projects.AsNoTracking().AnyAsync(p => p.Name == newName, ct))
        {
            var stamped = $"{src.Name} (가져옴 {DateTime.Now:yyyyMMdd_HHmmss})";
            var candidate = stamped;
            var n = 2;
            while (await db.Projects.AsNoTracking().AnyAsync(p => p.Name == candidate, ct))
            {
                candidate = $"{stamped}_{n++}";
                if (n > 100) throw new InvalidOperationException("프로젝트 이름 충돌이 100회 이상 발생했습니다.");
            }
            newName = candidate;
        }

        // 폴더는 PathResolver 가 같은 이름이면 같은 경로를 반환하므로 빈 폴더가 보장될 때까지 suffix.
        var folderName = newName;
        var folder = pathResolver.GetProjectFolder(folderName);
        var iter = 1;
        while (Directory.EnumerateFileSystemEntries(folder).Any())
        {
            folderName = $"{newName} ({iter++})";
            folder = pathResolver.GetProjectFolder(folderName);
            if (iter > 1000) throw new InvalidOperationException("프로젝트 폴더 충돌이 1000회 이상 발생했습니다.");
        }

        var newProject = new Project
        {
            Name = newName,
            Category = src.Category ?? string.Empty,
            Description = src.Description ?? string.Empty,
            Goal = src.Goal ?? string.Empty,
            Status = src.Status,
            StartDate = src.StartDate,
            EndDate = src.EndDate,
            Budget = src.Budget,
            Participants = src.Participants ?? string.Empty,
            Deliverables = src.Deliverables ?? string.Empty,
            RelatedLinks = src.RelatedLinks ?? string.Empty,
            FolderPath = folder,
            CompletedDate = src.CompletedDate,
            IssueCustomColumnsJson = src.IssueCustomColumnsJson ?? string.Empty,
        };
        db.Projects.Add(newProject);
        await db.SaveChangesAsync(ct);
        return (newProject, folder);
    }

    private async Task<int> ImportWbsVersionsAsync(
        AppDbContext backupDb, int srcProjectId, int newProjectId,
        Dictionary<int, int> versionIdMap, CancellationToken ct)
    {
        var srcVersions = await backupDb.WbsVersions.AsNoTracking()
            .Where(v => v.ProjectId == srcProjectId).ToListAsync(ct);
        if (srcVersions.Count == 0) return 0;
        var newVersions = srcVersions.Select(v => new WbsVersion
        {
            ProjectId = newProjectId,
            VersionName = v.VersionName ?? string.Empty,
            Description = v.Description ?? string.Empty,
            CreatedAt = v.CreatedAt,
            IsCurrent = v.IsCurrent,
        }).ToList();
        db.WbsVersions.AddRange(newVersions);
        await db.SaveChangesAsync(ct);
        for (var i = 0; i < srcVersions.Count; i++)
            versionIdMap[srcVersions[i].Id] = newVersions[i].Id;
        return newVersions.Count;
    }

    private async Task<int> ImportWbsItemsAsync(
        AppDbContext backupDb, int srcProjectId, int newProjectId,
        Dictionary<int, int> versionIdMap, Dictionary<int, int> wbsIdMap, CancellationToken ct)
    {
        var srcItems = await backupDb.WbsItems.AsNoTracking()
            .Where(w => w.ProjectId == srcProjectId).ToListAsync(ct);
        if (srcItems.Count == 0) return 0;

        // 1-pass: ParentId=null 로 모두 insert, version 만 즉시 매핑.
        var newItems = srcItems.Select(w => new WbsItem
        {
            ProjectId = newProjectId,
            VersionId = w.VersionId.HasValue && versionIdMap.TryGetValue(w.VersionId.Value, out var nv) ? nv : null,
            ParentId = null,
            Name = w.Name ?? string.Empty,
            Assignee = w.Assignee ?? string.Empty,
            StartDate = w.StartDate,
            EndDate = w.EndDate,
            Status = w.Status,
            IsMilestone = w.IsMilestone,
            Importance = w.Importance,
            SortOrder = w.SortOrder,
            Notes = w.Notes ?? string.Empty,
            CompletedDate = w.CompletedDate,
        }).ToList();
        db.WbsItems.AddRange(newItems);
        await db.SaveChangesAsync(ct);
        for (var i = 0; i < srcItems.Count; i++)
            wbsIdMap[srcItems[i].Id] = newItems[i].Id;

        // 2-pass: ParentId 재매핑 (있는 것만).
        var hasParents = false;
        for (var i = 0; i < srcItems.Count; i++)
        {
            var srcParent = srcItems[i].ParentId;
            if (srcParent.HasValue && wbsIdMap.TryGetValue(srcParent.Value, out var newParentId))
            {
                newItems[i].ParentId = newParentId;
                hasParents = true;
            }
        }
        if (hasParents) await db.SaveChangesAsync(ct);
        return newItems.Count;
    }

    private async Task<(int Imported, int Matched, int Missing)> ImportIssuesAsync(
        AppDbContext backupDb, int srcProjectId, int newProjectId,
        Dictionary<int, int> resourceIdMap, Dictionary<int, int> issueIdMap, CancellationToken ct)
    {
        var srcIssues = await backupDb.Issues.AsNoTracking()
            .Where(i => i.ProjectId == srcProjectId).ToListAsync(ct);
        if (srcIssues.Count == 0) return (0, 0, 0);

        var matched = 0;
        var missing = 0;
        var newIssues = srcIssues.Select(i =>
        {
            int? assignee = null;
            if (i.AssigneeResourceId.HasValue)
            {
                if (resourceIdMap.TryGetValue(i.AssigneeResourceId.Value, out var newId))
                {
                    assignee = newId;
                    matched++;
                }
                else
                {
                    missing++;
                }
            }
            return new Issue
            {
                ProjectId = newProjectId,
                Title = i.Title ?? string.Empty,
                Description = i.Description ?? string.Empty,
                Status = i.Status,
                Priority = i.Priority,
                AssigneeResourceId = assignee,
                DueDate = i.DueDate,
                OccurredOn = i.OccurredOn,
                ResolvedDate = i.ResolvedDate,
                Category = i.Category ?? string.Empty,
                CustomFieldsJson = i.CustomFieldsJson ?? string.Empty,
            };
        }).ToList();
        db.Issues.AddRange(newIssues);
        await db.SaveChangesAsync(ct);
        for (var i = 0; i < srcIssues.Count; i++)
            issueIdMap[srcIssues[i].Id] = newIssues[i].Id;
        return (newIssues.Count, matched, missing);
    }

    private async Task<int> ImportMeetingsAsync(
        AppDbContext backupDb, int srcProjectId, Project newProject, CancellationToken ct)
    {
        var srcMeetings = await backupDb.Meetings.AsNoTracking()
            .Where(m => m.ProjectId == srcProjectId).ToListAsync(ct);
        if (srcMeetings.Count == 0) return 0;

        var meetingsDir = pathResolver.GetMeetingsFolder(newProject.FolderPath);
        var newMeetings = srcMeetings.Select(m =>
        {
            string? rewrittenPath = null;
            if (!string.IsNullOrEmpty(m.MarkdownPath))
            {
                var fileName = Path.GetFileName(m.MarkdownPath);
                if (!string.IsNullOrEmpty(fileName))
                {
                    var candidate = Path.Combine(meetingsDir, fileName);
                    // 파일 존재 확인은 폴더 복사 후 시점이 더 정확하지만, 폴더 복사가 같은 트랜잭션 안에서 일어나므로
                    // 여기서는 경로만 rewrite 하고 실제 존재 여부는 사용자가 열 때 확인.
                    rewrittenPath = candidate;
                }
            }
            return new Meeting
            {
                ProjectId = newProject.Id,
                Date = m.Date,
                StartTime = m.StartTime,
                EndTime = m.EndTime,
                Attendees = m.Attendees ?? string.Empty,
                Topic = m.Topic ?? string.Empty,
                Decisions = m.Decisions ?? string.Empty,
                Discussion = m.Discussion ?? string.Empty,
                ActionItems = m.ActionItems ?? string.Empty,
                MarkdownPath = rewrittenPath,
            };
        }).ToList();
        db.Meetings.AddRange(newMeetings);
        await db.SaveChangesAsync(ct);
        return newMeetings.Count;
    }

    private async Task<(int Imported, List<string> Warnings)> ImportDevInfoAsync(
        AppDbContext backupDb, int srcProjectId, Project newProject, CancellationToken ct)
    {
        var warnings = new List<string>();
        var srcItems = await backupDb.DevInfoItems.AsNoTracking()
            .Where(d => d.ProjectId == srcProjectId).ToListAsync(ct);
        if (srcItems.Count == 0) return (0, warnings);

        var devFilesDir = pathResolver.GetDevFilesFolder(newProject.FolderPath);
        var refCount = 0;
        var newItems = srcItems.Select(d =>
        {
            var filePath = d.FilePath ?? string.Empty;
            if (d.Type == DevInfoType.File && !string.IsNullOrEmpty(filePath))
            {
                if (d.StorageMode == DevInfoStorageMode.Copy)
                {
                    var fileName = Path.GetFileName(filePath);
                    if (!string.IsNullOrEmpty(fileName))
                        filePath = Path.Combine(devFilesDir, fileName);
                }
                else
                {
                    refCount++;
                }
            }
            return new DevInfoItem
            {
                ProjectId = newProject.Id,
                Title = d.Title ?? string.Empty,
                Type = d.Type,
                StorageMode = d.StorageMode,
                Content = d.Content ?? string.Empty,
                FilePath = filePath,
                Url = d.Url ?? string.Empty,
                Tags = d.Tags ?? string.Empty,
            };
        }).ToList();
        db.DevInfoItems.AddRange(newItems);
        await db.SaveChangesAsync(ct);
        if (refCount > 0)
            warnings.Add($"업무 정보 {refCount} 건은 외부 경로 참조(Reference) 모드라 원본 머신의 경로를 그대로 유지합니다. 이 머신에서 파일이 없을 수 있습니다.");
        return (newItems.Count, warnings);
    }

    private async Task<int> ImportWorkLogsAsync(
        AppDbContext backupDb, int srcProjectId, int newProjectId, CancellationToken ct)
    {
        var srcLogs = await backupDb.WorkLogs.AsNoTracking()
            .Where(w => w.ProjectId == srcProjectId).ToListAsync(ct);
        if (srcLogs.Count == 0) return 0;
        var newLogs = srcLogs.Select(w => new WorkLog
        {
            ProjectId = newProjectId,
            Date = w.Date,
            Done = w.Done ?? string.Empty,
            Plan = w.Plan ?? string.Empty,
            Issues = w.Issues ?? string.Empty,
        }).ToList();
        db.WorkLogs.AddRange(newLogs);
        await db.SaveChangesAsync(ct);
        return newLogs.Count;
    }

    private async Task<int> ImportChangeLogsAsync(
        AppDbContext backupDb, int srcProjectId, int newProjectId,
        Dictionary<int, int> issueIdMap, Dictionary<int, int> wbsIdMap, CancellationToken ct)
    {
        var srcLogs = await backupDb.ChangeLogs.AsNoTracking()
            .Where(c => c.ProjectId == srcProjectId).ToListAsync(ct);
        if (srcLogs.Count == 0) return 0;
        var newLogs = srcLogs.Select(c => new ChangeLog
        {
            ProjectId = newProjectId,
            Date = c.Date,
            Content = c.Content ?? string.Empty,
            Impact = c.Impact,
            RelatedDocLinks = c.RelatedDocLinks ?? string.Empty,
            SourceIssueId = c.SourceIssueId.HasValue && issueIdMap.TryGetValue(c.SourceIssueId.Value, out var ni) ? ni : null,
            SourceWbsItemId = c.SourceWbsItemId.HasValue && wbsIdMap.TryGetValue(c.SourceWbsItemId.Value, out var nw) ? nw : null,
        }).ToList();
        db.ChangeLogs.AddRange(newLogs);
        await db.SaveChangesAsync(ct);
        return newLogs.Count;
    }

    private async Task<(int Imported, List<string> Warnings)> ImportIssueWbsLinksAsync(
        AppDbContext backupDb, int srcProjectId,
        Dictionary<int, int> issueIdMap, Dictionary<int, int> wbsIdMap, CancellationToken ct)
    {
        var warnings = new List<string>();
        // IssueWbsLink 자체에 ProjectId 가 없으므로 Issue.ProjectId 로 join.
        var srcLinks = await backupDb.IssueWbsLinks.AsNoTracking()
            .Include(l => l.Issue)
            .Where(l => l.Issue.ProjectId == srcProjectId)
            .ToListAsync(ct);
        if (srcLinks.Count == 0) return (0, warnings);

        var skipped = 0;
        var newLinks = new List<IssueWbsLink>(srcLinks.Count);
        foreach (var l in srcLinks)
        {
            if (!issueIdMap.TryGetValue(l.IssueId, out var newIssueId) ||
                !wbsIdMap.TryGetValue(l.WbsItemId, out var newWbsId))
            {
                skipped++;
                continue;
            }
            newLinks.Add(new IssueWbsLink
            {
                IssueId = newIssueId,
                WbsItemId = newWbsId,
                Type = l.Type,
            });
        }
        if (newLinks.Count > 0)
        {
            db.IssueWbsLinks.AddRange(newLinks);
            await db.SaveChangesAsync(ct);
        }
        if (skipped > 0)
            warnings.Add($"이슈-WBS 링크 {skipped} 건은 양쪽 매핑 실패로 가져오지 못했습니다.");
        return (newLinks.Count, warnings);
    }

    // 디렉토리 내용을 다른 디렉토리로 재귀 복사 (덮어쓰기).
    private static void CopyDirectoryContents(string source, string target)
    {
        foreach (var file in Directory.EnumerateFiles(source, "*", SearchOption.AllDirectories))
        {
            var rel = Path.GetRelativePath(source, file);
            var dst = Path.Combine(target, rel);
            Directory.CreateDirectory(Path.GetDirectoryName(dst)!);
            File.Copy(file, dst, overwrite: true);
        }
    }

    private static void TryDeleteDirectory(string path)
    {
        try { if (Directory.Exists(path)) Directory.Delete(path, recursive: true); }
        catch { /* best-effort cleanup */ }
    }
}
