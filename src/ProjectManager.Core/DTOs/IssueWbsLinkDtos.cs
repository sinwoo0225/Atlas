using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

// by-issue 조회 결과 (WBS 측 정보). by-wbs 조회 결과 (Issue 측 정보).
public record IssueWbsLinkDto(
    int Id, int IssueId, int WbsItemId, IssueWbsLinkType Type,
    string? IssueTitle, string? WbsItemName,
    DateTime CreatedAt, string CreatedBy);

// Type 미지정 시 RelatesTo 기본값 — 이전 클라이언트 호환.
public record CreateIssueWbsLinkDto(int IssueId, int WbsItemId, IssueWbsLinkType Type = IssueWbsLinkType.RelatesTo);

public record UpdateIssueWbsLinkTypeDto(IssueWbsLinkType Type);

// by-project 일괄 조회용 경량 DTO — 카운트 배지·dedupe 만 필요 (제목·날짜·작성자 제외).
public record IssueWbsLinkLite(int IssueId, int WbsItemId);
