namespace ProjectManager.Core.DTOs;

public record WbsSubtaskDto(
    int Id, int WbsItemId, string Title, bool IsDone, int SortOrder);

public record CreateWbsSubtaskDto(string Title);

// 부분 갱신 — 토글(IsDone)·이름 변경(Title) 각각 단독 가능. null 필드는 미변경.
public record UpdateWbsSubtaskDto(string? Title = null, bool? IsDone = null);
