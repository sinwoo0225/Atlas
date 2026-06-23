namespace ProjectManager.Core.DTOs;

// 카테고리별 포트폴리오 롤업 1행 — 프로젝트수·WBS진척·미결이슈·자원수요(시간)·위험(마감초과) 집계.
// Category 빈 문자열 = 미분류(프런트에서 i18n 라벨).
public record PortfolioRowDto(
    string Category, int ProjectCount,
    int WbsTotal, int WbsDone, int WbsProgressPercent,
    int OpenIssues, double DemandHours, int AtRisk);

public record PortfolioRollupDto(IReadOnlyList<PortfolioRowDto> Rows);
