namespace ProjectManager.Core.Domain;

// WBS/일정 템플릿 — 새 프로젝트마다 WBS 를 처음부터 세팅하는 수고를 덜기 위한 재사용 가능한 작업 트리.
// 빌트인 템플릿은 임베디드 JSON(BuiltInTemplateProvider)으로 제공되고, 사용자 커스텀 템플릿만 이 테이블에 저장된다.
// 작업 트리는 NodesJson (TEXT) 에 직렬화 — Meeting.ActionItems / ActivityLog.ChangesJson 의 JSON-in-TEXT 관례.
// Project FK 없음 (Resource 처럼 전역) — 프로젝트 간 재사용이 목적.
public class WbsTemplate : IAuditable
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    // WbsTemplateNode[] 직렬화 결과. 계층(children)·레벨별 순서(배열 인덱스)를 JSON 이 그대로 인코딩.
    public string NodesJson { get; set; } = "[]";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;
}
