using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Application.Services;

// 용량인지 계획 컨텍스트 번들 — 기존 서비스를 조합해 프로젝트의 작업·의존성·배정·자원·임계경로·진단을 1콜로.
// 새 repo 없음(WbsContextService 패턴). 에이전트가 리스케줄/배분을 추론하는 핵심 진입점.
public class PlanContextService(
    ProjectService projectService,
    WbsService wbsService,
    WbsDependencyService dependencyService,
    WbsAssignmentService assignmentService,
    ResourceService resourceService,
    SchedulingService schedulingService)
{
    public async Task<PlanContextDto?> GetPlanContextAsync(
        int projectId, int? versionId = null,
        bool includeResources = true, bool includeCriticalPath = true)
    {
        var project = await projectService.GetByIdAsync(projectId);
        if (project is null) return null;

        var tasks = (await wbsService.QueryAsync(projectId, versionId, WbsListFilter.None)).ToList();
        var deps = (await dependencyService.GetByProjectAsync(projectId, versionId)).ToList();
        var allocations = (await assignmentService.ListByProjectAsync(projectId, versionId)).ToList();
        var resources = includeResources
            ? (await resourceService.GetAllAsync()).ToList()
            : new List<ResourceDto>();
        var critical = includeCriticalPath
            ? await schedulingService.ComputeCriticalPathAsync(projectId, versionId)
            : null;

        var diagnostics = BuildDiagnostics(tasks, deps);
        return new PlanContextDto(project, tasks, deps, allocations, resources, critical, diagnostics);
    }

    // 마감 초과 + 의존성 위반(후행이 선행 제약보다 일찍) — 결정론 진단. 에이전트의 리스케줄 트리거.
    private static List<PlanDiagnosticDto> BuildDiagnostics(
        List<WbsItemDto> tasks, List<WbsDependencyDto> deps)
    {
        var today = DateTime.Today;
        var byId = tasks.ToDictionary(t => t.Id);
        var diags = new List<PlanDiagnosticDto>();

        foreach (var t in tasks.Where(t =>
            t.Status != WbsStatus.Done && !t.IsMilestone && t.EndDate.HasValue && t.EndDate.Value.Date < today))
            diags.Add(new PlanDiagnosticDto("overdue", t.Id, $"마감 초과 {t.EndDate:yyyy-MM-dd}: {t.Name}"));

        foreach (var d in deps)
        {
            if (!byId.TryGetValue(d.PredecessorId, out var p) || !byId.TryGetValue(d.SuccessorId, out var s)) continue;
            var violated = d.Type switch
            {
                WbsDependencyType.FinishToStart => p.EndDate.HasValue && s.StartDate.HasValue && s.StartDate.Value.Date <= p.EndDate.Value.Date,
                WbsDependencyType.StartToStart => p.StartDate.HasValue && s.StartDate.HasValue && s.StartDate.Value.Date < p.StartDate.Value.Date,
                WbsDependencyType.FinishToFinish => p.EndDate.HasValue && s.EndDate.HasValue && s.EndDate.Value.Date < p.EndDate.Value.Date,
                _ => false,
            };
            if (violated)
                diags.Add(new PlanDiagnosticDto("dependency_violation", d.SuccessorId,
                    $"'{s.Name}' 이 선행 '{p.Name}' 제약({d.Type}) 위반"));
        }
        return diags;
    }
}
