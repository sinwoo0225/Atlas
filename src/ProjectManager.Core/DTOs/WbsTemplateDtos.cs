namespace ProjectManager.Core.DTOs;

// 템플릿 작업 노드 — 빌트인 JSON 파일과 커스텀 템플릿의 NodesJson 이 공용으로 쓰는 스키마.
// 날짜는 절대값이 아니라 앵커(프로젝트 시작일) 기준 상대 오프셋. 빌트인은 보통 offset/duration 이 null (구조만).
//   offsetStartDays: 앵커로부터 시작 일수. null => StartDate 없음.
//   durationDays:    기간(일, inclusive). 마일스톤=0, null => EndDate 없음.
// init 프로퍼티 + 대소문자 무시 역직렬화로 camelCase JSON 매핑.
public record WbsTemplateNodeDto
{
    public string Name { get; init; } = string.Empty;
    public string Assignee { get; init; } = string.Empty;
    public int? OffsetStartDays { get; init; }
    public int? DurationDays { get; init; }
    public bool IsMilestone { get; init; }
    public int Importance { get; init; } = 2;
    public string Notes { get; init; } = string.Empty;
    public List<WbsTemplateNodeDto> Children { get; init; } = new();
}

// 목록용 — 노드 트리 제외 (가벼움). isBuiltIn=true 면 id 는 null, builtinKey 로 식별.
public record WbsTemplateSummaryDto(
    int? Id, string? BuiltinKey, bool IsBuiltIn,
    string Name, string Description, string Category,
    int NodeCount,
    DateTime? CreatedAt, DateTime? UpdatedAt);

public record WbsTemplateDto(
    int? Id, string? BuiltinKey, bool IsBuiltIn,
    string Name, string Description, string Category,
    IReadOnlyList<WbsTemplateNodeDto> Nodes,
    DateTime? CreatedAt, DateTime? UpdatedAt);

public record CreateWbsTemplateDto(
    string Name, string Description, string Category,
    IReadOnlyList<WbsTemplateNodeDto> Nodes);

public record UpdateWbsTemplateDto(
    string Name, string Description, string Category,
    IReadOnlyList<WbsTemplateNodeDto> Nodes,
    DateTime UpdatedAt);

// 템플릿을 프로젝트 WBS 로 인스턴스화. TemplateId(커스텀) 또는 BuiltinKey(빌트인) 중 하나.
// AnchorDate null 이면 서버가 프로젝트 StartDate ?? Today 사용. SkipWeekends=true 면 토·일 건너뜀.
public record ApplyTemplateDto(
    int? TemplateId, string? BuiltinKey,
    DateTime? AnchorDate, int? VersionId, bool SkipWeekends);

public record ApplyTemplateResultDto(int CreatedCount);

// 기존 프로젝트 WBS 를 템플릿으로 저장 — 절대 날짜를 최저 시작일 기준 상대 오프셋으로 변환.
public record CreateTemplateFromProjectDto(
    int ProjectId, string Name, string Description, string Category, int? VersionId);
