using System.Diagnostics;
using Microsoft.Web.WebView2.Core;

namespace ProjectManager.DesktopApp;

// target="_blank" / window.open 으로 열리는 링크(마크다운 본문의 외부 링크 등)를 앱 WebView2
// 안에서 새 창으로 띄우지 않고 시스템 기본 브라우저(또는 메일 클라이언트)로 넘긴다.
// 메인 창과 위젯 창이 공유. 핸들러가 없으면 WebView2 가 관리되지 않는 팝업 창을 띄우므로
// 모든 요청에 Handled=true 를 세팅해 팝업을 막고, 안전한 스킴만 외부로 실행한다.
internal static class ExternalLinkHandler
{
    public static void Attach(CoreWebView2 core)
    {
        core.NewWindowRequested += (_, e) =>
        {
            // 관리되지 않는 새 WebView2 팝업을 항상 차단.
            e.Handled = true;

            if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri)) return;

            // http/https/mailto 만 OS 로 위임. file:/javascript: 등 위험 스킴은 무시.
            var scheme = uri.Scheme;
            if (scheme != Uri.UriSchemeHttp && scheme != Uri.UriSchemeHttps && scheme != Uri.UriSchemeMailto)
                return;

            try
            {
                Process.Start(new ProcessStartInfo(e.Uri) { UseShellExecute = true });
            }
            catch
            {
                // 브라우저/메일 클라이언트 실행 실패는 조용히 무시(앱 흐름 유지).
            }
        };
    }
}
