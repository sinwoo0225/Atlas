namespace ProjectManager.Core.Domain;

// WbsItem 의 경량 체크리스트 항목(서브태스크). 중첩 WBS 작업(parentId/Children)과 별개로,
// 한 작업 안에서 TODO 식으로 세부 단계를 추가/완료한다. 진행률(완료/전체)은 목록 배지·간트 % 로 표시.
// IAuditable → ActivityLogInterceptor 가 추가/완료/삭제를 자동 캡처. 부모 WBS 삭제 시 cascade.
public class WbsSubtask : IAuditable
{
    public int Id { get; set; }
    public int WbsItemId { get; set; }
    public string Title { get; set; } = string.Empty;
    public bool IsDone { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;

    public WbsItem WbsItem { get; set; } = null!;
}
