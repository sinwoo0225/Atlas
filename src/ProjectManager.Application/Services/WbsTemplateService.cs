using System.Text.Json;
using System.Text.Json.Serialization;
using ProjectManager.Application.Templates;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;
using ProjectManager.Infrastructure.Persistence;

namespace ProjectManager.Application.Services;

// 도메인 검증 실패(템플릿 미지정, 빈 WBS 등) — 컨트롤러가 BadRequest 로 매핑.
public class WbsTemplateException(string message) : Exception(message);

public class WbsTemplateService(
    IWbsTemplateRepository repo,
    IWbsRepository wbsRepo,
    IProjectRepository projectRepo,
    BuiltInTemplateProvider builtins,
    AppDbContext db)
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    // 목록 — 빌트인(이름순) 먼저, 커스텀(이름순) 뒤. 노드 트리는 제외하고 개수만.
    public async Task<IEnumerable<WbsTemplateSummaryDto>> ListAsync()
    {
        var customs = await repo.GetAllAsync();
        var builtinSummaries = builtins.All().Select(t => new WbsTemplateSummaryDto(
            null, t.Key, true, t.Name, t.Description, t.Category, CountNodes(t.Nodes), null, null));
        var customSummaries = customs.Select(t => new WbsTemplateSummaryDto(
            t.Id, null, false, t.Name, t.Description, t.Category,
            CountNodes(Deserialize(t.NodesJson)), t.CreatedAt, t.UpdatedAt));
        return builtinSummaries.Concat(customSummaries);
    }

    public async Task<WbsTemplateDto?> GetAsync(int? id, string? builtinKey)
    {
        if (!string.IsNullOrEmpty(builtinKey))
        {
            var b = builtins.ByKey(builtinKey);
            return b is null ? null : new WbsTemplateDto(
                null, b.Key, true, b.Name, b.Description, b.Category, b.Nodes, null, null);
        }
        if (id is int tid)
        {
            var t = await repo.GetByIdAsync(tid);
            return t is null ? null : ToDto(t);
        }
        return null;
    }

    public async Task<WbsTemplateDto> CreateAsync(CreateWbsTemplateDto dto)
    {
        var t = new WbsTemplate
        {
            Name = dto.Name,
            Description = dto.Description,
            Category = dto.Category,
            NodesJson = Serialize(dto.Nodes),
        };
        return ToDto(await repo.CreateAsync(t));
    }

    public async Task<WbsTemplateDto?> UpdateAsync(int id, UpdateWbsTemplateDto dto)
    {
        var t = await repo.GetByIdAsync(id);
        if (t is null) return null;
        t.Name = dto.Name;
        t.Description = dto.Description;
        t.Category = dto.Category;
        t.NodesJson = Serialize(dto.Nodes);
        return ToDto(await repo.UpdateAsync(t, dto.UpdatedAt));
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var t = await repo.GetByIdAsync(id);
        if (t is null) return false;
        await repo.DeleteAsync(id);
        return true;
    }

    // 템플릿을 프로젝트 WBS 로 인스턴스화. 프로젝트 없으면 null(404). 트리는 ImportWbsItemsAsync 와 같은 2-pass.
    // WbsService.CreateAsync 를 거치지 않음 — 그쪽은 SortOrder 재계산(템플릿 순서 훼손) + N회 왕복.
    public async Task<ApplyTemplateResultDto?> ApplyAsync(int projectId, ApplyTemplateDto dto)
    {
        var project = await projectRepo.GetByIdAsync(projectId);
        if (project is null) return null;

        var nodes = await ResolveNodesAsync(dto.TemplateId, dto.BuiltinKey);
        var anchor = (dto.AnchorDate ?? project.StartDate ?? DateTime.Today).Date;

        // 기존 WBS 뒤에 append — 새 루트들의 SortOrder 를 기존 루트 max+1 부터 시작.
        var existing = (await wbsRepo.GetByProjectAsync(projectId, dto.VersionId)).ToList();
        var existingRoots = existing.Where(x => x.ParentId == null).ToList();
        var rootSortBase = existingRoots.Count > 0 ? existingRoots.Max(x => x.SortOrder) + 1 : 0;

        // pre-order DFS 평탄화 — 각 항목의 부모 temp 인덱스 + 레벨별 SortOrder 기록.
        var flat = new List<(WbsTemplateNodeDto Node, int? ParentTemp, int Sort)>();
        void Walk(IReadOnlyList<WbsTemplateNodeDto> ns, int? parentTemp, int sortBase)
        {
            for (var i = 0; i < ns.Count; i++)
            {
                flat.Add((ns[i], parentTemp, sortBase + i));
                var myTemp = flat.Count - 1;
                Walk(ns[i].Children, myTemp, 0);
            }
        }
        Walk(nodes, null, rootSortBase);

        // 1-pass: ParentId=null 로 모두 insert (id 부여), 날짜는 앵커 기준 계산.
        var newItems = flat.Select(f =>
        {
            var (start, end) = ComputeDates(f.Node, anchor, dto.SkipWeekends);
            return new WbsItem
            {
                ProjectId = projectId,
                VersionId = dto.VersionId,
                ParentId = null,
                Name = f.Node.Name,
                Assignee = f.Node.Assignee ?? string.Empty,
                StartDate = start,
                EndDate = end,
                Status = WbsStatus.Planned,
                IsMilestone = f.Node.IsMilestone,
                Importance = f.Node.Importance is 1 or 2 or 3 ? f.Node.Importance : 2,
                SortOrder = f.Sort,
                Notes = f.Node.Notes ?? string.Empty,
            };
        }).ToList();
        db.WbsItems.AddRange(newItems);
        await db.SaveChangesAsync();

        // 2-pass: temp 인덱스 → 새 Id 로 ParentId 재매핑.
        var hasParents = false;
        for (var i = 0; i < flat.Count; i++)
        {
            if (flat[i].ParentTemp is int p)
            {
                newItems[i].ParentId = newItems[p].Id;
                hasParents = true;
            }
        }
        if (hasParents) await db.SaveChangesAsync();

        return new ApplyTemplateResultDto(newItems.Count);
    }

    // 기존 프로젝트 WBS → 템플릿. 절대 날짜를 최저 시작일 앵커 기준 상대 오프셋으로 변환.
    public async Task<WbsTemplateDto> CreateFromProjectAsync(CreateTemplateFromProjectDto dto)
    {
        var items = (await wbsRepo.GetByProjectAsync(dto.ProjectId, dto.VersionId)).ToList();
        if (items.Count == 0)
            throw new WbsTemplateException("WBS 작업이 없어 템플릿으로 저장할 수 없습니다.");

        var dated = items.Where(i => i.StartDate.HasValue).Select(i => i.StartDate!.Value.Date).ToList();
        DateTime? anchor = dated.Count > 0 ? dated.Min() : null;

        var byParent = items.ToLookup(i => i.ParentId);

        List<WbsTemplateNodeDto> Build(int? parentId) =>
            byParent[parentId]
                .OrderBy(x => x.SortOrder)
                .Select(k => new WbsTemplateNodeDto
                {
                    Name = k.Name,
                    Assignee = k.Assignee,
                    OffsetStartDays = anchor.HasValue && k.StartDate.HasValue
                        ? (int)(k.StartDate!.Value.Date - anchor.Value).TotalDays
                        : null,
                    DurationDays = k.StartDate.HasValue && k.EndDate.HasValue
                        ? (int)(k.EndDate!.Value.Date - k.StartDate!.Value.Date).TotalDays + 1
                        : (k.IsMilestone ? 0 : null),
                    IsMilestone = k.IsMilestone,
                    Importance = k.Importance,
                    Notes = k.Notes,
                    Children = Build(k.Id),
                }).ToList();

        var nodes = Build(null);
        var t = new WbsTemplate
        {
            Name = dto.Name,
            Description = dto.Description,
            Category = dto.Category,
            NodesJson = Serialize(nodes),
        };
        return ToDto(await repo.CreateAsync(t));
    }

    private async Task<IReadOnlyList<WbsTemplateNodeDto>> ResolveNodesAsync(int? templateId, string? builtinKey)
    {
        if (!string.IsNullOrEmpty(builtinKey))
        {
            var b = builtins.ByKey(builtinKey)
                ?? throw new WbsTemplateException("선택한 빌트인 템플릿을 찾을 수 없습니다.");
            return b.Nodes;
        }
        if (templateId is int tid)
        {
            var t = await repo.GetByIdAsync(tid)
                ?? throw new WbsTemplateException("선택한 템플릿을 찾을 수 없습니다.");
            return Deserialize(t.NodesJson);
        }
        throw new WbsTemplateException("적용할 템플릿을 지정해야 합니다.");
    }

    private static (DateTime? Start, DateTime? End) ComputeDates(
        WbsTemplateNodeDto node, DateTime anchor, bool skipWeekends)
    {
        if (node.OffsetStartDays is null) return (null, null);
        var start = Advance(anchor, node.OffsetStartDays.Value, skipWeekends);
        if (node.IsMilestone) return (start, start);
        if (node.DurationDays is null) return (start, null);
        var span = Math.Max(0, node.DurationDays.Value - 1); // 기간 inclusive
        return (start, Advance(start, span, skipWeekends));
    }

    // skipWeekends=true 면 토·일 제외하고 days 영업일 전진 (음수면 후진). 앵커가 주말이면 먼저 평일로 정규화.
    private static DateTime Advance(DateTime from, int days, bool skipWeekends)
    {
        if (!skipWeekends) return from.AddDays(days);
        var d = from;
        while (IsWeekend(d)) d = d.AddDays(1);
        var step = days >= 0 ? 1 : -1;
        var remaining = Math.Abs(days);
        while (remaining > 0)
        {
            d = d.AddDays(step);
            if (!IsWeekend(d)) remaining--;
        }
        return d;
    }

    private static bool IsWeekend(DateTime d) =>
        d.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;

    private static int CountNodes(IReadOnlyList<WbsTemplateNodeDto> nodes) =>
        nodes.Sum(n => 1 + CountNodes(n.Children));

    private WbsTemplateDto ToDto(WbsTemplate t) => new(
        t.Id, null, false, t.Name, t.Description, t.Category,
        Deserialize(t.NodesJson), t.CreatedAt, t.UpdatedAt);

    private static List<WbsTemplateNodeDto> Deserialize(string json) =>
        string.IsNullOrWhiteSpace(json)
            ? new()
            : JsonSerializer.Deserialize<List<WbsTemplateNodeDto>>(json, JsonOpts) ?? new();

    private static string Serialize(IReadOnlyList<WbsTemplateNodeDto> nodes) =>
        JsonSerializer.Serialize(nodes, JsonOpts);
}
