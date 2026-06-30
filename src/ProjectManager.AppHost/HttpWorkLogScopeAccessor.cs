using Microsoft.AspNetCore.Http;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.AppHost;

// X-Atlas-WorkLog-Scope 헤더('mine' | 'all')에서 업무일지 작성 범위를 읽는다.
// 헤더가 없거나 'mine' 이 아니면 전체(MineOnly=false) — 기존 동작 보존.
public sealed class HttpWorkLogScopeAccessor(IHttpContextAccessor httpContextAccessor) : IWorkLogScopeAccessor
{
    private const string ScopeHeader = "X-Atlas-WorkLog-Scope";

    public bool MineOnly
    {
        get
        {
            var raw = httpContextAccessor.HttpContext?.Request.Headers[ScopeHeader].ToString();
            return string.Equals(raw?.Trim(), "mine", StringComparison.OrdinalIgnoreCase);
        }
    }
}
