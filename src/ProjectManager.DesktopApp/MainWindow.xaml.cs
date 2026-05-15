using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Interop;
using Microsoft.AspNetCore.Http;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;

namespace ProjectManager.DesktopApp;

public partial class MainWindow : Window
{
    private InProcessHost? _host;
    private string _wwwroot = "";
    private const string VirtualHost = "atlas.local";
    private static readonly string AppUrl = $"https://{VirtualHost}/index.html";

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

    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        Closing += OnClosing;
    }

    protected override void OnSourceInitialized(System.EventArgs e)
    {
        base.OnSourceInitialized(e);
        var source = (HwndSource)PresentationSource.FromVisual(this)!;
        source.AddHook(WndProc);
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        try
        {
            _host = new InProcessHost();
            await _host.StartAsync();
            await InitializeWebViewAsync();
        }
        catch (System.Exception ex)
        {
            StatusText.Text = $"앱 시작 실패:\n{ex.Message}";
            MessageBox.Show(ex.ToString(), "오류", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async Task InitializeWebViewAsync()
    {
        // WebView2 사용자 데이터(쿠키·세션·pm-hub-settings localStorage 포함)는 머신·계정별 상태라
        // 데이터 폴더가 공유 위치로 옮겨가도 같이 옮기면 동료 간 설정이 충돌한다.
        // 따라서 데이터 폴더 설정과 무관하게 %LOCALAPPDATA%\Atlas\WebView2 에 고정.
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var userDataFolder = Path.Combine(local, "Atlas", "WebView2");

        // 과거에 Documents\ProjectManager\WebView2 에 두던 사용자라면 한 번만 자동 이주.
        var legacy = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            "ProjectManager", "WebView2");
        if (!Directory.Exists(userDataFolder) && Directory.Exists(legacy))
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(userDataFolder)!);
                Directory.Move(legacy, userDataFolder);
            }
            catch
            {
                // 이주 실패해도 신규 폴더로 그냥 진행 (기존 다크모드·마지막 프로젝트 정도가 초기화).
            }
        }

        Directory.CreateDirectory(userDataFolder);
        var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
        await WebView.EnsureCoreWebView2Async(env);

        // single-file 환경에서 실제 exe 옆 폴더(= wwwroot) 를 정적파일 소스로 잡는다.
        var exeDir = Path.GetDirectoryName(Environment.ProcessPath) ?? AppContext.BaseDirectory;
        _wwwroot = Path.Combine(exeDir, "wwwroot");

        // SetVirtualHostNameToFolderMapping 와 WebResourceRequested 가 같은 호스트에 공존하면
        // 가상호스트가 우선되어 핸들러가 발화하지 않는다. 따라서 가상호스트는 쓰지 않고
        // 모든 요청을 WebResourceRequested 로 가로채서 처리한다.
        WebView.CoreWebView2.AddWebResourceRequestedFilter(
            $"*://{VirtualHost}/*", CoreWebView2WebResourceContext.All);
        WebView.CoreWebView2.WebResourceRequested += OnApiRequested;

        // 프론트엔드 ↔ WPF 호스트 메시지 브릿지. 현재는 네이티브 폴더 다이얼로그용.
        WebView.CoreWebView2.WebMessageReceived += OnHostMessageReceived;

        WebView.CoreWebView2.Navigate(AppUrl);
        LoadingOverlay.Visibility = Visibility.Collapsed;
    }

    private void OnHostMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            if (!doc.RootElement.TryGetProperty("type", out var typeEl)) return;
            var type = typeEl.GetString();

            if (type == "pickFolder")
            {
                var requestId = doc.RootElement.TryGetProperty("requestId", out var rid) ? rid.GetString() : null;
                var initialPath = doc.RootElement.TryGetProperty("initialPath", out var ip) ? ip.GetString() : null;

                var dlg = new OpenFolderDialog
                {
                    Title = "데이터 폴더 선택",
                    Multiselect = false,
                };
                if (!string.IsNullOrEmpty(initialPath) && Directory.Exists(initialPath))
                    dlg.InitialDirectory = initialPath;

                var ok = dlg.ShowDialog(this) == true;
                var picked = ok ? dlg.FolderName : null;

                var response = JsonSerializer.Serialize(new
                {
                    type = "pickFolderResult",
                    requestId,
                    path = picked,
                });
                WebView.CoreWebView2.PostWebMessageAsJson(response);
            }
            else if (type == "pickFile")
            {
                var requestId = doc.RootElement.TryGetProperty("requestId", out var rid) ? rid.GetString() : null;
                var initialDir = doc.RootElement.TryGetProperty("initialDir", out var idEl) ? idEl.GetString() : null;
                var title = doc.RootElement.TryGetProperty("title", out var tEl) ? tEl.GetString() : null;

                var dlg = new OpenFileDialog
                {
                    Title = string.IsNullOrEmpty(title) ? "파일 선택" : title,
                    Multiselect = false,
                    CheckFileExists = true,
                };
                if (!string.IsNullOrEmpty(initialDir) && Directory.Exists(initialDir))
                    dlg.InitialDirectory = initialDir;

                var ok = dlg.ShowDialog(this) == true;
                var picked = ok ? dlg.FileName : null;

                var response = JsonSerializer.Serialize(new
                {
                    type = "pickFileResult",
                    requestId,
                    path = picked,
                });
                WebView.CoreWebView2.PostWebMessageAsJson(response);
            }
        }
        catch (System.Exception ex)
        {
            TryLog($"[host-bridge-err] {ex.GetType().Name}: {ex.Message}");
        }
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

            // GET/HEAD 가 아닌데 src.Content 가 있다면 body 를 모두 읽어서 byte[] 로 buffer.
            // CoreWebView2 가 주는 stream 은 한 번만 읽을 수 있고, lifecycle 도 짧다.
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

            // 헤더 분리: Content-* 류는 content 헤더로, 나머지는 request 헤더로.
            // Content-Type 을 별도로 캐치해서 ByteArrayContent.Headers.ContentType 으로 명시 설정.
            foreach (var h in src.Headers)
            {
                if (string.Equals(h.Key, "Content-Type", StringComparison.OrdinalIgnoreCase))
                {
                    incomingContentType = h.Value;
                    continue;
                }
                if (!req.Headers.TryAddWithoutValidation(h.Key, h.Value))
                {
                    // request 헤더로 못 들어가는 건 보통 content 헤더 (Content-Length, Content-Disposition 등)
                }
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

            using var resp = await _host!.Client.SendAsync(req);
            var bytes = await resp.Content.ReadAsByteArrayAsync();
            var statusCode = (int)resp.StatusCode;
            if (statusCode >= 400)
            {
                var preview = bytes.Length > 0
                    ? Encoding.UTF8.GetString(bytes, 0, Math.Min(bytes.Length, 400))
                    : "(empty)";
                TryLog($"[api-err] {src.Method} {path} -> {statusCode}: {preview}");
            }

            var sb = new StringBuilder();
            foreach (var h in resp.Headers.Concat(resp.Content.Headers))
                foreach (var v in h.Value)
                    sb.AppendLine($"{h.Key}: {v}");

            e.Response = WebView.CoreWebView2.Environment.CreateWebResourceResponse(
                new MemoryStream(bytes), (int)resp.StatusCode, resp.ReasonPhrase ?? "OK",
                sb.ToString().TrimEnd());
        }
        catch (System.Exception ex)
        {
            TryLog($"[api-error] {path}: {ex.GetType().Name}: {ex.Message}\n{ex.StackTrace}");
            var msg = Encoding.UTF8.GetBytes(
                $"{{\"error\":\"{ex.GetType().Name}: {ex.Message.Replace("\"", "\\\"")}\"}}");
            e.Response = WebView.CoreWebView2.Environment.CreateWebResourceResponse(
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
        // query string 제거, 선행 / 제거.
        var qIdx = pathAndQuery.IndexOf('?');
        var path = (qIdx >= 0 ? pathAndQuery[..qIdx] : pathAndQuery).TrimStart('/');
        if (string.IsNullOrEmpty(path)) path = "index.html";

        var full = Path.GetFullPath(Path.Combine(_wwwroot, path.Replace('/', Path.DirectorySeparatorChar)));
        // 디렉토리 탈출 방지
        var rootFull = Path.GetFullPath(_wwwroot) + Path.DirectorySeparatorChar;
        if (!full.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase))
            full = Path.Combine(_wwwroot, "index.html");

        // 정적파일이 없으면 SPA fallback → index.html (React Router 지원)
        if (!File.Exists(full))
            full = Path.Combine(_wwwroot, "index.html");

        try
        {
            var bytes = File.ReadAllBytes(full);
            var ext = Path.GetExtension(full);
            var mime = MimeMap.TryGetValue(ext, out var m) ? m : "application/octet-stream";
            return WebView.CoreWebView2.Environment.CreateWebResourceResponse(
                new MemoryStream(bytes), 200, "OK", $"Content-Type: {mime}");
        }
        catch (System.Exception ex)
        {
            TryLog($"[static-error] {path}: {ex.Message}");
            var msg = Encoding.UTF8.GetBytes($"Not Found: {path}");
            return WebView.CoreWebView2.Environment.CreateWebResourceResponse(
                new MemoryStream(msg), 404, "Not Found", "Content-Type: text/plain; charset=utf-8");
        }
    }

    private static void TryLog(string line)
    {
        try
        {
            var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var dir = Path.Combine(local, "Atlas");
            Directory.CreateDirectory(dir);
            var path = Path.Combine(dir, "atlas-debug.log");
            File.AppendAllText(path, $"[{DateTime.Now:HH:mm:ss.fff}] {line}\n");
        }
        catch { }
    }

    private async void OnClosing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        if (_host is not null)
        {
            await _host.DisposeAsync();
            _host = null;
        }
    }

    private void TitleBar_MouseLeftButtonDown(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (e.ClickCount == 2)
            WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
        else
            DragMove();
    }

    private void MinimizeButton_Click(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;

    private void MaximizeButton_Click(object sender, RoutedEventArgs e) =>
        WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;

    private void CloseButton_Click(object sender, RoutedEventArgs e) => Close();

    // ---------- Taskbar-aware maximize ----------
    private const int WM_GETMINMAXINFO = 0x0024;
    private const int MONITOR_DEFAULTTONEAREST = 0x00000002;

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_GETMINMAXINFO)
        {
            var mmi = Marshal.PtrToStructure<MINMAXINFO>(lParam);
            var monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            if (monitor != IntPtr.Zero)
            {
                var info = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
                if (GetMonitorInfo(monitor, ref info))
                {
                    var work = info.rcWork;
                    var mon = info.rcMonitor;
                    mmi.ptMaxPosition.X = work.Left - mon.Left;
                    mmi.ptMaxPosition.Y = work.Top - mon.Top;
                    mmi.ptMaxSize.X = work.Right - work.Left;
                    mmi.ptMaxSize.Y = work.Bottom - work.Top;
                    mmi.ptMaxTrackSize = mmi.ptMaxSize;
                    Marshal.StructureToPtr(mmi, lParam, true);
                }
            }
            handled = true;
        }
        return IntPtr.Zero;
    }

    [DllImport("user32.dll")] private static extern IntPtr MonitorFromWindow(IntPtr hwnd, int flags);
    [DllImport("user32.dll")] private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO info);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X, Y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct MONITORINFO
    {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public int dwFlags;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MINMAXINFO
    {
        public POINT ptReserved;
        public POINT ptMaxSize;
        public POINT ptMaxPosition;
        public POINT ptMinTrackSize;
        public POINT ptMaxTrackSize;
    }
}
