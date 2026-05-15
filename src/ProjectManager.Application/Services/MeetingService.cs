using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

public class MeetingService(
    IMeetingRepository repo,
    IProjectRepository projectRepo,
    MeetingMarkdownExporter exporter)
{
    public async Task<IEnumerable<MeetingDto>> GetByProjectAsync(int projectId, string? keyword = null) =>
        (await repo.GetByProjectAsync(projectId, keyword)).Select(ToDto);

    public async Task<MeetingDto?> GetByIdAsync(int id)
    {
        var item = await repo.GetByIdAsync(id);
        return item is null ? null : ToDto(item);
    }

    public async Task<MeetingDto> CreateAsync(CreateMeetingDto dto)
    {
        var meeting = new Meeting
        {
            ProjectId = dto.ProjectId, Date = dto.Date,
            StartTime = dto.StartTime, EndTime = dto.EndTime,
            Attendees = dto.Attendees, Topic = dto.Topic,
            Decisions = dto.Decisions, Discussion = dto.Discussion,
            ActionItems = dto.ActionItems
        };
        var created = await repo.CreateAsync(meeting);
        // md export 는 Id 부여 후라야 frontmatter 가 의미 있다.
        await SyncMarkdownAsync(created, oldPath: null);
        return ToDto(created);
    }

    public async Task<MeetingDto?> UpdateAsync(int id, UpdateMeetingDto dto)
    {
        var meeting = await repo.GetByIdAsync(id);
        if (meeting is null) return null;
        var oldPath = meeting.MarkdownPath;
        meeting.Date = dto.Date;
        meeting.StartTime = dto.StartTime; meeting.EndTime = dto.EndTime;
        meeting.Attendees = dto.Attendees;
        meeting.Topic = dto.Topic; meeting.Decisions = dto.Decisions;
        meeting.Discussion = dto.Discussion; meeting.ActionItems = dto.ActionItems;
        var updated = await repo.UpdateAsync(meeting);
        await SyncMarkdownAsync(updated, oldPath);
        return ToDto(updated);
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var meeting = await repo.GetByIdAsync(id);
        if (meeting is null) return false;
        await exporter.DeleteAsync(meeting.MarkdownPath);
        await repo.DeleteAsync(id);
        return true;
    }

    // md 파일 갱신 + MarkdownPath 컬럼 동기화. 옛 경로와 새 경로가 다르면 옛 파일도 삭제.
    private async Task SyncMarkdownAsync(Meeting meeting, string? oldPath)
    {
        var project = await projectRepo.GetByIdAsync(meeting.ProjectId);
        if (project is null) return;

        var newPath = await exporter.SaveAsync(project, meeting);
        if (!string.IsNullOrEmpty(oldPath) && !string.Equals(oldPath, newPath, StringComparison.OrdinalIgnoreCase))
            await exporter.DeleteAsync(oldPath);

        if (newPath is not null && !string.Equals(meeting.MarkdownPath, newPath, StringComparison.OrdinalIgnoreCase))
        {
            meeting.MarkdownPath = newPath;
            await repo.UpdateAsync(meeting);
        }
    }

    private static MeetingDto ToDto(Meeting m) => new(
        m.Id, m.ProjectId, m.Date, m.StartTime, m.EndTime,
        m.Attendees, m.Topic,
        m.Decisions, m.Discussion, m.ActionItems,
        m.MarkdownPath,
        m.CreatedAt, m.UpdatedAt);
}
