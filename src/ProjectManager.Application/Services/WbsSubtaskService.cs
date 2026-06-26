using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

// WbsItem 의 경량 체크리스트(서브태스크) CRUD. 진행률 카운트(완료/전체)는 WbsService 가 WbsItemDto 에 투영한다.
public class WbsSubtaskService(IWbsSubtaskRepository repo)
{
    public async Task<IEnumerable<WbsSubtaskDto>> ListAsync(int wbsItemId) =>
        (await repo.GetByWbsItemAsync(wbsItemId)).Select(ToDto);

    public async Task<WbsSubtaskDto> AddAsync(int wbsItemId, CreateWbsSubtaskDto dto)
    {
        var existing = (await repo.GetByWbsItemAsync(wbsItemId)).ToList();
        var nextOrder = existing.Count > 0 ? existing.Max(x => x.SortOrder) + 1 : 0;
        var created = await repo.CreateAsync(new WbsSubtask
        {
            WbsItemId = wbsItemId,
            Title = (dto.Title ?? string.Empty).Trim(),
            SortOrder = nextOrder,
        });
        return ToDto(created);
    }

    // 부분 갱신 — 토글(IsDone)·이름(Title) 각각 단독. null 필드는 미변경.
    public async Task<WbsSubtaskDto?> UpdateAsync(int id, UpdateWbsSubtaskDto dto)
    {
        var s = await repo.GetByIdAsync(id);
        if (s is null) return null;
        if (dto.Title is not null) s.Title = dto.Title.Trim();
        if (dto.IsDone is bool done) s.IsDone = done;
        return ToDto(await repo.UpdateAsync(s));
    }

    public Task<bool> DeleteAsync(int id) => repo.DeleteAsync(id);

    private static WbsSubtaskDto ToDto(WbsSubtask s) =>
        new(s.Id, s.WbsItemId, s.Title, s.IsDone, s.SortOrder);
}
