using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

public class WbsDependencyConflictException(string message) : Exception(message);

// WbsItem(선행) → WbsItem(후행) 의존성 CRUD. 동일 프로젝트 가드 + 사이클 가드(추가 시 순환 형성 거부).
public class WbsDependencyService(IWbsDependencyRepository repo, IWbsRepository wbsRepo)
{
    public async Task<IEnumerable<WbsDependencyDto>> GetByProjectAsync(int projectId, int? versionId = null) =>
        (await repo.GetByProjectAsync(projectId, versionId)).Select(ToDto);

    public async Task<IEnumerable<WbsDependencyDto>> GetByWbsItemAsync(int wbsItemId) =>
        (await repo.GetByWbsItemAsync(wbsItemId)).Select(ToDto);

    public async Task<WbsDependencyDto> CreateAsync(CreateWbsDependencyDto dto)
    {
        if (dto.PredecessorId == dto.SuccessorId)
            throw new WbsDependencyConflictException("작업을 자기 자신에 의존시킬 수 없습니다.");

        var pred = await wbsRepo.GetByIdAsync(dto.PredecessorId)
            ?? throw new WbsDependencyConflictException("선행 작업을 찾을 수 없습니다.");
        var succ = await wbsRepo.GetByIdAsync(dto.SuccessorId)
            ?? throw new WbsDependencyConflictException("후행 작업을 찾을 수 없습니다.");
        if (pred.ProjectId != succ.ProjectId)
            throw new WbsDependencyConflictException("다른 프로젝트의 작업끼리는 의존시킬 수 없습니다.");

        if (await repo.GetAsync(dto.PredecessorId, dto.SuccessorId) is not null)
            throw new WbsDependencyConflictException("이미 의존성이 있습니다.");

        // 사이클 가드 — succ 에서 pred 로 가는 경로가 이미 있으면 pred→succ 추가 시 순환.
        var edges = (await repo.GetByProjectAsync(pred.ProjectId)).ToList();
        if (Reachable(edges, dto.SuccessorId, dto.PredecessorId))
            throw new WbsDependencyConflictException("순환 의존성이 생깁니다 (후행이 이미 선행보다 앞섭니다).");

        var created = await repo.CreateAsync(new WbsDependency
        {
            PredecessorId = dto.PredecessorId,
            SuccessorId = dto.SuccessorId,
            Type = dto.Type,
            LagDays = dto.LagDays,
        });
        return (await GetByWbsItemAsync(dto.PredecessorId)).First(d => d.Id == created.Id);
    }

    public Task<bool> DeleteAsync(int predecessorId, int successorId) =>
        repo.DeleteAsync(predecessorId, successorId);

    // from 에서 to 로 도달 가능한지(선행→후행 방향 DFS). WbsService.UpdateAsync 의 walk-up 가드와 같은 형태.
    private static bool Reachable(List<WbsDependency> edges, int from, int to)
    {
        var adj = edges.GroupBy(e => e.PredecessorId)
            .ToDictionary(g => g.Key, g => g.Select(e => e.SuccessorId).ToList());
        var stack = new Stack<int>();
        var seen = new HashSet<int>();
        stack.Push(from);
        while (stack.Count > 0)
        {
            var cur = stack.Pop();
            if (cur == to) return true;
            if (!seen.Add(cur)) continue;
            if (adj.TryGetValue(cur, out var nexts))
                foreach (var n in nexts) stack.Push(n);
        }
        return false;
    }

    private static WbsDependencyDto ToDto(WbsDependency d) => new(
        d.Id, d.PredecessorId, d.SuccessorId,
        d.Predecessor?.Name, d.Successor?.Name,
        d.Type, d.LagDays);
}
