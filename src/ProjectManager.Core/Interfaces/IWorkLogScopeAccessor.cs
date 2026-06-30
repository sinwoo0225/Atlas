namespace ProjectManager.Core.Interfaces;

// 업무일지 자동 등록 범위(설정의 '작성 범위'). MineOnly=true 면 actor 본인이 담당인 작업/이슈만 일지에 기록.
// AppHost 는 X-Atlas-WorkLog-Scope 헤더로 구현(HttpWorkLogScopeAccessor), CLI/MCP 는 항상 false(전체).
// 인증 아닌 동작 옵션 마커 — 권한 결정에 쓰지 말 것(IActorAccessor 와 동일 전제).
public interface IWorkLogScopeAccessor
{
    bool MineOnly { get; }
}
