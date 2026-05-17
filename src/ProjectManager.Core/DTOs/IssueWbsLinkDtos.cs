namespace ProjectManager.Core.DTOs;

// by-issue 조회 결과 (WBS 측 정보). by-wbs 조회 결과 (Issue 측 정보).
public record IssueWbsLinkDto(
    int Id, int IssueId, int WbsItemId,
    string? IssueTitle, string? WbsItemName,
    DateTime CreatedAt, string CreatedBy);

public record CreateIssueWbsLinkDto(int IssueId, int WbsItemId);

// by-project 일괄 조회용 경량 DTO — 카운트 배지·dedupe 만 필요 (제목·날짜·작성자 제외).
public record IssueWbsLinkLite(int IssueId, int WbsItemId);
