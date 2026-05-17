using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

public class IssueWbsLinkConflictException(string message) : Exception(message);

public class IssueWbsLinkService(
    IIssueWbsLinkRepository repo,
    IIssueRepository issueRepo,
    IWbsRepository wbsRepo)
{
    public async Task<IEnumerable<IssueWbsLinkDto>> GetByIssueAsync(int issueId) =>
        (await repo.GetByIssueAsync(issueId)).Select(ToDto);

    public async Task<IEnumerable<IssueWbsLinkDto>> GetByWbsItemAsync(int wbsItemId) =>
        (await repo.GetByWbsItemAsync(wbsItemId)).Select(ToDto);

    public async Task<IssueWbsLinkDto> CreateAsync(CreateIssueWbsLinkDto dto)
    {
        var issue = await issueRepo.GetByIdAsync(dto.IssueId)
            ?? throw new IssueWbsLinkConflictException("Issue 를 찾을 수 없습니다.");
        var wbs = await wbsRepo.GetByIdAsync(dto.WbsItemId)
            ?? throw new IssueWbsLinkConflictException("WBS 항목을 찾을 수 없습니다.");
        if (issue.ProjectId != wbs.ProjectId)
            throw new IssueWbsLinkConflictException("다른 프로젝트의 항목끼리는 연결할 수 없습니다.");

        if (await repo.GetAsync(dto.IssueId, dto.WbsItemId) is not null)
            throw new IssueWbsLinkConflictException("이미 연결되어 있습니다.");

        var created = await repo.CreateAsync(new IssueWbsLink
        {
            IssueId = dto.IssueId,
            WbsItemId = dto.WbsItemId,
        });
        // 응답 직렬화 위해 다시 로드 (Issue/WbsItem navigation 채워서)
        return (await GetByIssueAsync(dto.IssueId)).First(l => l.Id == created.Id);
    }

    public Task<bool> DeleteAsync(int issueId, int wbsItemId) => repo.DeleteAsync(issueId, wbsItemId);

    public async Task<IEnumerable<IssueWbsLinkLite>> GetByProjectAsync(int projectId) =>
        (await repo.GetByProjectAsync(projectId))
            .Select(t => new IssueWbsLinkLite(t.IssueId, t.WbsItemId));

    private static IssueWbsLinkDto ToDto(IssueWbsLink l) => new(
        l.Id, l.IssueId, l.WbsItemId,
        l.Issue?.Title, l.WbsItem?.Name,
        l.CreatedAt, l.CreatedBy);
}
