using System.Drawing;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using ProjectManager.Infrastructure.Config;

namespace ProjectManager.DesktopApp;

// 데스크톱 보조 위젯 창. 프레임리스 + always-on-top + 조절 가능 투명도.
// WPF Window 는 AllowsTransparency 없이는 반투명이 안 되고(있으면 WebView2 입력이 막힘),
// WinForms Form.Opacity 는 WebView2 콘텐츠까지 반투명 처리하면서 입력도 정상이라 Form 으로 호스팅한다.
// 메인 창과 같은 CoreWebView2Environment 를 공유하므로 테마·작성자(localStorage)가 그대로 유지된다.
public sealed class WidgetForm : Form
{
    private readonly CoreWebView2Environment _env;
    private readonly Func<HttpClient?> _apiClient;
    private readonly string _wwwroot;
    private readonly Microsoft.Web.WebView2.WinForms.WebView2 _webView;
    private MediaController? _media;
    private ActiveWindowTracker? _activeWindows;
    private bool _initialized;
    private double _widgetOpacity = 0.92;

    private static readonly string WidgetUrl = "https://atlas.local/widget";

    public WidgetForm(CoreWebView2Environment env, Func<HttpClient?> apiClient, string wwwroot)
    {
        _env = env;
        _apiClient = apiClient;
        _wwwroot = wwwroot;

        var c = BootstrapConfig.Load();
        _widgetOpacity = Math.Clamp(c.WidgetOpacity <= 0 ? 0.92 : c.WidgetOpacity, 0.4, 1.0);

        Text = "Atlas 위젯";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        MinimumSize = new Size(280, 360);
        Size = new Size(
            c.WidgetWidth > 100 ? (int)c.WidgetWidth : 360,
            c.WidgetHeight > 100 ? (int)c.WidgetHeight : 560);
        Location = ComputeLocation(c);
        TopMost = c.WidgetPinned;
        Opacity = _widgetOpacity;
        BackColor = ColorTranslator.FromHtml("#12151b");

        _webView = new Microsoft.Web.WebView2.WinForms.WebView2 { Dock = DockStyle.Fill };
        Controls.Add(_webView);

        FormClosing += (_, _) =>
        {
            PersistState();
            _media?.Dispose(); _media = null;
            _activeWindows?.Dispose(); _activeWindows = null;
        };
    }

    private Point ComputeLocation(BootstrapConfig c)
    {
        var wa = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 720);
        if (c.WidgetX <= 0 && c.WidgetY <= 0)
            return new Point(Math.Max(wa.Left, wa.Right - Width - 24), wa.Top + 24);
        var x = (int)Math.Min(Math.Max(c.WidgetX, wa.Left), wa.Right - 80);
        var y = (int)Math.Min(Math.Max(c.WidgetY, wa.Top), wa.Bottom - 80);
        return new Point(x, y);
    }

    protected override async void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        if (_initialized) return;
        _initialized = true;
        try
        {
            await _webView.EnsureCoreWebView2Async(_env);
            new WebViewServer(_webView.CoreWebView2, _apiClient, _wwwroot).Attach();
            _webView.CoreWebView2.WebMessageReceived += OnWidgetMessage;
            _webView.CoreWebView2.Navigate(WidgetUrl);

            // SMTC 미디어 컨트롤러 — 상태 변화를 위젯으로 push(UI 스레드 마샬링).
            _media = new MediaController(PushToWeb);
            await _media.InitAsync();

            // 최근 활성 창 추적 — UI 스레드(메시지 루프)에서 생성. 활성화는 위젯이 설정값으로 토글.
            _activeWindows = new ActiveWindowTracker(PushToWeb, (uint)Environment.ProcessId);
        }
        catch (System.Exception ex)
        {
            DesktopLog.Write($"[widget-init-err] {ex.GetType().Name}: {ex.Message}");
        }
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        ApplyRoundedCorners();
    }

    private void ApplyRoundedCorners()
    {
        try
        {
            int pref = DWMWCP_ROUND;
            DwmSetWindowAttribute(Handle, DWMWA_WINDOW_CORNER_PREFERENCE, ref pref, sizeof(int));
        }
        catch { /* 구버전 Windows */ }
    }

    private void OnWidgetMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            if (!doc.RootElement.TryGetProperty("type", out var typeEl)) return;
            switch (typeEl.GetString())
            {
                case "setWidgetOpacity":
                    if (doc.RootElement.TryGetProperty("opacity", out var opEl))
                    {
                        _widgetOpacity = Math.Clamp(opEl.GetDouble(), 0.4, 1.0);
                        Opacity = _widgetOpacity;
                        PersistState();
                    }
                    break;
                case "setWidgetPinned":
                    if (doc.RootElement.TryGetProperty("pinned", out var pinEl))
                    {
                        TopMost = pinEl.GetBoolean();
                        PersistState();
                    }
                    break;
                case "beginWidgetDrag":
                    BeginNativeDrag();
                    break;
                case "mediaControl":
                    _ = _media?.ControlAsync(doc.RootElement.TryGetProperty("action", out var aEl) ? aEl.GetString() : null);
                    break;
                case "mediaSeek":
                    if (_media is not null && doc.RootElement.TryGetProperty("seconds", out var skEl))
                        _ = _media.SeekAsync(skEl.GetDouble());
                    break;
                case "mediaRequest":
                    _ = _media?.RequestAsync();
                    break;
                case "setActiveWindowsEnabled":
                    if (doc.RootElement.TryGetProperty("enabled", out var awEl))
                        _activeWindows?.SetEnabled(awEl.GetBoolean());
                    break;
                case "activeWindowsRequest":
                    _activeWindows?.Request();
                    break;
                case "hideWidget":
                case "closeWidget":
                    Hide();
                    PersistState();
                    break;
            }
        }
        catch (System.Exception ex)
        {
            DesktopLog.Write($"[widget-bridge-err] {ex.GetType().Name}: {ex.Message}");
        }
    }

    // 네이티브(임의 스레드) → 위젯 WebView2 로 JSON push. WebView2 호출은 생성 스레드(UI)에서만 가능.
    private void PushToWeb(string json)
    {
        if (IsDisposed) return;
        try
        {
            if (InvokeRequired) BeginInvoke(() => SafePost(json));
            else SafePost(json);
        }
        catch { /* 폼 종료 중 등 */ }
    }

    private void SafePost(string json)
    {
        try { _webView.CoreWebView2?.PostWebMessageAsJson(json); } catch { }
    }

    // 프레임리스 창을 웹 타이틀바 영역에서 끌어 이동 — 표준 WM_NCLBUTTONDOWN(HTCAPTION) 드래그 루프.
    private void BeginNativeDrag()
    {
        try
        {
            ReleaseCapture();
            SendMessage(Handle, WM_NCLBUTTONDOWN, (IntPtr)HTCAPTION, IntPtr.Zero);
        }
        catch { /* best effort */ }
    }

    private void PersistState()
    {
        try
        {
            var c = BootstrapConfig.Load();
            if (WindowState == FormWindowState.Normal && Visible)
            {
                c.WidgetX = Location.X;
                c.WidgetY = Location.Y;
                c.WidgetWidth = Width;
                c.WidgetHeight = Height;
            }
            c.WidgetOpacity = _widgetOpacity;
            c.WidgetPinned = TopMost;
            BootstrapConfig.Save(c);
        }
        catch (System.Exception ex)
        {
            DesktopLog.Write($"[widget-persist-err] {ex.Message}");
        }
    }

    // ---------- Win32 ----------
    private const int WM_NCLBUTTONDOWN = 0x00A1;
    private const int HTCAPTION = 0x0002;
    private const int DWMWA_WINDOW_CORNER_PREFERENCE = 33;
    private const int DWMWCP_ROUND = 2;

    [DllImport("user32.dll")] private static extern bool ReleaseCapture();
    [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
    [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);
}
