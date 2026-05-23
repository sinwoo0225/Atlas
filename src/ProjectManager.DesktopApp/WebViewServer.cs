using System.IO;
using System.Net.Http;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Web.WebView2.Core;

namespace ProjectManager.DesktopApp;

// atlas.local/* 요청을 가로채 정적파일(wwwroot) 서빙 + /api 프록시(_apiClient)로 처리.
// MainWindow·WidgetWindow 두 WebView2 가 동일 배선을 공유하기 위해 추출. (메시지 브릿지는 창마다 별도)
internal sealed class WebViewServer
{
    private readonly CoreWebView2 _core;
    private readonly Func<HttpClient?> _apiClient;
    private readonly string _wwwroot;
    private const string VirtualHost = "atlas.local";

    private static readonly Dictionary<string, string> MimeMap = new(StringComparer.OrdinalIgnoreCase)
    {
        [".html"] = "text/html; charset=utf-8",
        [".htm"] = "text/html; charset=utf-8",
        [".js"] = "application/javascript; charset=utf-8",
        [".mjs"] = "application/javascript; charset=utf-8",
        [".css"] = "text/css; charset=utf-8",
        [".json"] = "application/json; charset=utf-8",
        [".svg"] = "image/svg+xml",
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".gif"] = "image/gif",
        [".webp"] = "image/webp",
        [".ico"] = "image/x-icon",
        [".woff"] = "font/woff",
        [".woff2"] = "font/woff2",
        [".ttf"] = "font/ttf",
        [".map"] = "application/json; charset=utf-8",
        [".txt"] = "text/plain; charset=utf-8",
    };

    public WebViewServer(CoreWebView2 core, Func<HttpClient?> apiClient, string wwwroot)
    {
        _core = core;
        _apiClient = apiClient;
        _wwwroot = wwwroot;
    }

    // SetVirtualHostNameToFolderMapping 와 WebResourceRequested 가 공존하면 가상호스트가 우선되어
    // 핸들러가 발화하지 않는다. 따라서 가상호스트 미사용 — 모든 요청을 여기서 가로챈다.
    public void Attach()
    {
        _core.AddWebResourceRequestedFilter($"*://{VirtualHost}/*", CoreWebView2WebResourceContext.All);
        _core.WebResourceRequested += OnApiRequested;
    }

    private async void OnApiRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        var deferral = e.GetDeferral();
        string path = "?";
        try
        {
            var src = e.Request;
            var uri = new Uri(src.Uri);
            path = uri.PathAndQuery;

            // 정적파일 처리 (api 가 아닌 모든 요청)
            if (!path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase))
            {
                e.Response = BuildStaticResponse(path);
                return;
            }

            var req = new HttpRequestMessage(new HttpMethod(src.Method), path);

            // GET/HEAD 가 아닌데 body 가 있으면 모두 읽어 byte[] 로 buffer.
            // CoreWebView2 가 주는 stream 은 한 번만 읽을 수 있고 lifecycle 도 짧다.
            byte[]? bodyBytes = null;
            string? incomingContentType = null;
            if (src.Content is not null
                && !HttpMethods.IsGet(src.Method)
                && !HttpMethods.IsHead(src.Method))
            {
                using var ms = new MemoryStream();
                await src.Content.CopyToAsync(ms);
                bodyBytes = ms.ToArray();
            }

            foreach (var h in src.Headers)
            {
                if (string.Equals(h.Key, "Content-Type", StringComparison.OrdinalIgnoreCase))
                {
                    incomingContentType = h.Value;
                    continue;
                }
                req.Headers.TryAddWithoutValidation(h.Key, h.Value);
            }

            if (bodyBytes is not null)
            {
                var content = new ByteArrayContent(bodyBytes);
                if (!string.IsNullOrEmpty(incomingContentType)
                    && System.Net.Http.Headers.MediaTypeHeaderValue.TryParse(incomingContentType, out var mt))
                {
                    content.Headers.ContentType = mt;
                }
                req.Content = content;
            }

            var apiClient = _apiClient()
                ?? throw new InvalidOperationException("API client not ready");
            using var resp = await apiClient.SendAsync(req);
            var bytes = await resp.Content.ReadAsByteArrayAsync();
            var statusCode = (int)resp.StatusCode;
            if (statusCode >= 400)
            {
                var preview = bytes.Length > 0
                    ? Encoding.UTF8.GetString(bytes, 0, Math.Min(bytes.Length, 400))
                    : "(empty)";
                DesktopLog.Write($"[api-err] {src.Method} {path} -> {statusCode}: {preview}");
            }

            var sb = new StringBuilder();
            foreach (var h in resp.Headers.Concat(resp.Content.Headers))
                foreach (var v in h.Value)
                    sb.AppendLine($"{h.Key}: {v}");

            e.Response = _core.Environment.CreateWebResourceResponse(
                new MemoryStream(bytes), (int)resp.StatusCode, resp.ReasonPhrase ?? "OK",
                sb.ToString().TrimEnd());
        }
        catch (System.Exception ex)
        {
            DesktopLog.Write($"[api-error] {path}: {ex.GetType().Name}: {ex.Message}\n{ex.StackTrace}");
            var msg = Encoding.UTF8.GetBytes(
                $"{{\"error\":\"{ex.GetType().Name}: {ex.Message.Replace("\"", "\\\"")}\"}}");
            e.Response = _core.Environment.CreateWebResourceResponse(
                new MemoryStream(msg), 500, "Internal Server Error",
                "Content-Type: application/json; charset=utf-8");
        }
        finally
        {
            deferral.Complete();
        }
    }

    private CoreWebView2WebResourceResponse BuildStaticResponse(string pathAndQuery)
    {
        var qIdx = pathAndQuery.IndexOf('?');
        var path = (qIdx >= 0 ? pathAndQuery[..qIdx] : pathAndQuery).TrimStart('/');
        if (string.IsNullOrEmpty(path)) path = "index.html";

        var full = Path.GetFullPath(Path.Combine(_wwwroot, path.Replace('/', Path.DirectorySeparatorChar)));
        // 디렉토리 탈출 방지
        var rootFull = Path.GetFullPath(_wwwroot) + Path.DirectorySeparatorChar;
        if (!full.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase))
            full = Path.Combine(_wwwroot, "index.html");

        // 정적파일이 없으면 SPA fallback → index.html (React Router 지원: /widget 등)
        if (!File.Exists(full))
            full = Path.Combine(_wwwroot, "index.html");

        try
        {
            var bytes = File.ReadAllBytes(full);
            var ext = Path.GetExtension(full);
            var mime = MimeMap.TryGetValue(ext, out var m) ? m : "application/octet-stream";
            return _core.Environment.CreateWebResourceResponse(
                new MemoryStream(bytes), 200, "OK", $"Content-Type: {mime}");
        }
        catch (System.Exception ex)
        {
            DesktopLog.Write($"[static-error] {path}: {ex.Message}");
            var msg = Encoding.UTF8.GetBytes($"Not Found: {path}");
            return _core.Environment.CreateWebResourceResponse(
                new MemoryStream(msg), 404, "Not Found", "Content-Type: text/plain; charset=utf-8");
        }
    }
}
