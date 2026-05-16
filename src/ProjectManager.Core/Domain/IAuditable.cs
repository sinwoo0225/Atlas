namespace ProjectManager.Core.Domain;

// X-Atlas-Actor 헤더로 들어온 actor 문자열을 AppDbContext.SaveChanges 가 자동으로 채워준다.
// 인증 아닌 메타데이터 마커 — 위조 가능하므로 권한 결정에 쓰지 말 것.
public interface IAuditable
{
    string CreatedBy { get; set; }
    string UpdatedBy { get; set; }
}
