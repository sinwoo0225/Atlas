namespace ProjectManager.Core.DTOs;

// by-issue 조회 결과 (WBS 측 정보). by-wbs 조회 결과 (Issue 측 정보).
public record IssueWbsLinkDto(
    int Id, int IssueId, int WbsItemId,
    string? IssueTitle, string? WbsItemName,
    DateTime CreatedAt, string CreatedBy);

public record CreateIssueWbsLinkDto(int IssueId, int WbsItemId);
