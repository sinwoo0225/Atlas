using ProjectManager.Core.Interfaces;

namespace ProjectManager.AppHost.Composition;

// HTTP 컨텍스트가 없는 호스트(콘솔 CLI / MCP 서버) 에서 actor 를 한 번 정해두고 항상 같은 값을 반환.
// ActivityLogInterceptor 가 이 actor 로 모든 audit 행을 표시 — Atlas GUI 활동 페이지의 필터에서
// 'claude-code' / 'claude-code-mcp' 등으로 추리면 외부 자동화가 만든 변경만 추출 가능.
public sealed class FixedActorAccessor(string actor) : IActorAccessor
{
    public string GetActor() => actor;
}
