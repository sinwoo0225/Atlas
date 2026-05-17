using ProjectManager.Core.Interfaces;

namespace ProjectManager.Cli;

// HTTP 컨텍스트가 없는 호스트(콘솔/MCP) 에서 actor 를 한 번 정해두고 항상 같은 값을 반환.
// ActivityLogInterceptor 가 이 actor 로 모든 audit 행을 표시 — Atlas GUI 활동 페이지의 필터에서
// 'claude-code' (또는 env 로 지정한 이름) 만 골라 보면 CLI 가 만든 변경만 추출 가능.
internal sealed class FixedActorAccessor(string actor) : IActorAccessor
{
    public string GetActor() => actor;
}
