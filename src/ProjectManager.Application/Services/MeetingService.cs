using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

public class MeetingService(IMeetingRepository repo)
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
            Attendees = dto.Attendees, Topic = dto.Topic,
            Decisions = dto.Decisions, Discussion = dto.Discussion,
            ActionItems = dto.ActionItems
        };
        return ToDto(await repo.CreateAsync(meeting));
    }

    public async Task<MeetingDto?> UpdateAsync(int id, UpdateMeetingDto dto)
    {
        var meeting = await repo.GetByIdAsync(id);
        if (meeting is null) return null;
        meeting.Date = dto.Date; meeting.Attendees = dto.Attendees;
        meeting.Topic = dto.Topic; meeting.Decisions = dto.Decisions;
        meeting.Discussion = dto.Discussion; meeting.ActionItems = dto.ActionItems;
        return ToDto(await repo.UpdateAsync(meeting));
    }

    public async Task<bool> DeleteAsync(int id)
    {
        if (await repo.GetByIdAsync(id) is null) return false;
        await repo.DeleteAsync(id);
        return true;
    }

    private static MeetingDto ToDto(Meeting m) => new(
        m.Id, m.ProjectId, m.Date, m.Attendees, m.Topic,
        m.Decisions, m.Discussion, m.ActionItems, m.CreatedAt, m.UpdatedAt);
}
