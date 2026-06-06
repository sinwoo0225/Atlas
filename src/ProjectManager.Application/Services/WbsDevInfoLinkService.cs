using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

public class WbsDevInfoLinkConflictException(string message) : Exception(message);

// WbsItem ↔ DevInfoItem "관련 정보" 연결. 무타입 단순 다대다.
public class WbsDevInfoLinkService(
    IWbsDevInfoLinkRepository repo,
    IWbsRepository wbsRepo,
    IDevInfoRepository devInfoRepo)
{
    public async Task<IEnumerable<WbsDevInfoLinkDto>> GetByWbsItemAsync(int wbsItemId) =>
        (await repo.GetByWbsItemAsync(wbsItemId)).Select(ToDto);

    public async Task<IEnumerable<WbsDevInfoLinkDto>> GetByDevInfoAsync(int devInfoItemId) =>
        (await repo.GetByDevInfoAsync(devInfoItemId)).Select(ToDto);

    public async Task<WbsDevInfoLinkDto> CreateAsync(CreateWbsDevInfoLinkDto dto)
    {
        var wbs = await wbsRepo.GetByIdAsync(dto.WbsItemId)
            ?? throw new WbsDevInfoLinkConflictException("WBS 항목을 찾을 수 없습니다.");
        var devInfo = await devInfoRepo.GetByIdAsync(dto.DevInfoItemId)
            ?? throw new WbsDevInfoLinkConflictException("업무 정보를 찾을 수 없습니다.");
        if (wbs.ProjectId != devInfo.ProjectId)
            throw new WbsDevInfoLinkConflictException("다른 프로젝트의 항목끼리는 연결할 수 없습니다.");

        if (await repo.GetAsync(dto.WbsItemId, dto.DevInfoItemId) is not null)
            throw new WbsDevInfoLinkConflictException("이미 연결되어 있습니다.");

        var created = await repo.CreateAsync(new WbsDevInfoLink
        {
            WbsItemId = dto.WbsItemId,
            DevInfoItemId = dto.DevInfoItemId,
        });
        // 응답 직렬화 위해 다시 로드 (DevInfoItem navigation 채워서).
        return (await GetByWbsItemAsync(dto.WbsItemId)).First(l => l.Id == created.Id);
    }

    public Task<bool> DeleteAsync(int wbsItemId, int devInfoItemId) => repo.DeleteAsync(wbsItemId, devInfoItemId);

    public async Task<IEnumerable<WbsDevInfoLinkLite>> GetByProjectAsync(int projectId) =>
        (await repo.GetByProjectAsync(projectId))
            .Select(t => new WbsDevInfoLinkLite(t.WbsItemId, t.DevInfoItemId));

    private static WbsDevInfoLinkDto ToDto(WbsDevInfoLink l) => new(
        l.Id, l.WbsItemId, l.DevInfoItemId,
        l.WbsItem?.Name, l.DevInfoItem?.Title, l.DevInfoItem?.Type,
        l.CreatedAt, l.CreatedBy);
}
