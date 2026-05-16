using Microsoft.AspNetCore.Http;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.AppHost;

// X-Atlas-Actor 헤더에서 actor 문자열을 추출. 한글 사용자명 보호를 위해 클라가 encodeURIComponent 로
// 인코딩해 보내고 여기서 UnescapeDataString 으로 디코딩.
public sealed class HttpActorAccessor(IHttpContextAccessor httpContextAccessor) : IActorAccessor
{
    private const string ActorHeader = "X-Atlas-Actor";

    public string GetActor()
    {
        var raw = httpContextAccessor.HttpContext?.Request.Headers[ActorHeader].ToString();
        if (string.IsNullOrEmpty(raw)) return string.Empty;
        try { return Uri.UnescapeDataString(raw).Trim(); }
        catch { return raw.Trim(); }
    }
}
