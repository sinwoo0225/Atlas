namespace ProjectManager.Core.Domain;

public enum TodoStatus { Open, Done }

// 반복 주기. None = 1회성. 완료 시 하이브리드 기준으로 다음 1회차만 자동 생성.
public enum TodoRecurrence { None, Daily, Weekly, Monthly, Yearly }

// 어느 프로젝트에도 속하지 않는 독립 TODO. 프로젝트 WBS/이슈와 함께 '내 업무(my-work)' 화면에 합쳐 표시된다.
// 담당자는 '나' 신원 통일을 위해 Resource FK (WBS 의 자유문자열과 달리).
public class TodoItem : IAuditable
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public int? AssigneeResourceId { get; set; }
    public DateTime? DueDate { get; set; }
    public TodoStatus Status { get; set; } = TodoStatus.Open;
    // 완료일(실적). 완료 처리 시 자동 스탬프.
    public DateTime? CompletedDate { get; set; }
    public TodoRecurrence Recurrence { get; set; } = TodoRecurrence.None;
    // "N 주기마다" — Recurrence 단위의 배수. 기본 1.
    public int RecurrenceInterval { get; set; } = 1;
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;

    public Resource? AssigneeResource { get; set; }
}
