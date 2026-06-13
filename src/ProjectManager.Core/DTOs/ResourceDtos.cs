using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

public record ResourceDto(
    int Id, string Name, ResourceType Type,
    string Department, string Email, string Phone, string Notes,
    DateTime CreatedAt, DateTime UpdatedAt);

public record CreateResourceDto(
    string Name, ResourceType Type,
    string Department, string Email, string Phone, string Notes);

public record UpdateResourceDto(
    string Name, ResourceType Type,
    string Department, string Email, string Phone, string Notes);

public record ResourceAssignmentDto(
    int WbsItemId, int ProjectId, string ProjectName,
    string WbsItemName, DateTime? StartDate, DateTime? EndDate,
    WbsStatus Status);

// '나' 신원 통일 — 설정의 내 이름으로 Person 리소스를 찾거나 생성.
public record ResolveResourceDto(string Name);
