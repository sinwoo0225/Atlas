namespace ProjectManager.Core.DTOs;

// WBS 작업 한 건의 종합 컨텍스트 — 에이전트가 "관련 정보 참고해 개발 계획" 을 1콜로 수집하도록 묶는다.
// (ProjectDashboardDto 와 같은 집계 DTO 패턴.)
//   Item            : 작업 본문(Name·Notes·status·dates·assignee). Children 은 별도 필드라 여기선 null.
//   Children        : 1-level 하위 작업.
//   RelatedDevInfo  : 연결된 업무 정보 풀 DTO — GitRepo 의 FilePath(저장소 경로)·Markdown 의 Content(스펙)·Url 포함.
//   RelatedIssues   : 연결된 이슈 풀 DTO.
//   SourceChangeLogs: 이 작업이 출처(SourceWbsItemId)인 변경이력.
public record WbsContextDto(
    WbsItemDto Item,
    IEnumerable<WbsItemDto> Children,
    IEnumerable<DevInfoItemDto> RelatedDevInfo,
    IEnumerable<IssueDto> RelatedIssues,
    IEnumerable<ChangeLogDto> SourceChangeLogs);
