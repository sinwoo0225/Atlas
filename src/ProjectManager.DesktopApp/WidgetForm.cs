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
    private AppBarDock? _dock;
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
            // 도킹 해제를 가장 먼저 — 여기서 빠뜨리면 사용자 데스크톱에 죽은 띠가 남는다.
            _dock?.Dispose(); _dock = null;
            _media?.Dispose(); _media = null;
            _activeWindows?.Dispose(); _activeWindows = null;
        };

        // 안전망: FormClosing 을 거치지 않고 프로세스가 끝나는 경로(Environment.Exit, 미처리 예외 종료 등)에서도
        // 작업 영역은 반드시 돌려준다. 예약이 남으면 Atlas 가 떠 있지도 않은데 화면 한쪽이 죽은 띠로 남는다.
        AppDomain.CurrentDomain.ProcessExit += (_, _) => { try { _dock?.Undock(); } catch { } };
    }

    // 저장된 좌표가 어느 모니터에 있든 그 모니터의 작업 영역으로 클램프한다.
    // (예전엔 무조건 PrimaryScreen 으로 클램프해서, 보조 모니터에 둔 위젯이 재시작하면 주 모니터로 끌려왔다.)
    private Point ComputeLocation(BootstrapConfig c)
    {
        if (c.WidgetX <= 0 && c.WidgetY <= 0)
        {
            var pw = (Screen.PrimaryScreen ?? Screen.AllScreens[0]).WorkingArea;
            return new Point(Math.Max(pw.Left, pw.Right - Width - 24), pw.Top + 24);
        }
        var saved = new Point((int)c.WidgetX, (int)c.WidgetY);
        // 저장 위치를 품은 모니터(없으면 가장 가까운 모니터)의 작업 영역 기준으로 클램프.
        var wa = Screen.FromPoint(saved).WorkingArea;
        var x = Math.Min(Math.Max(saved.X, wa.Left), wa.Right - 80);
        var y = Math.Min(Math.Max(saved.Y, wa.Top), wa.Bottom - 80);
        return new Point(x, y);
    }

    // ---------- 도킹 (AppBar) ----------

    private bool IsDocked => _dock is { IsDocked: true };

    // 설정에 저장된 도킹 상태를 적용. 창이 보여진 뒤(핸들 생성 후) 호출한다.
    private void ApplyDockFromConfig()
    {
        var c = BootstrapConfig.Load();
        if (!string.Equals(c.WidgetDockMode, "appbar", StringComparison.OrdinalIgnoreCase)) return;
        SetDock(true, c.WidgetDockEdge, c.WidgetDockMonitor, (int)c.WidgetDockWidth);
    }

    private void SetDock(bool enabled, string? edge, string? monitor, int width)
    {
        if (!enabled)
        {
            _dock?.Undock();
            ApplyCornerPreference(rounded: true);
            RestoreFloating();
            PersistDock(false, edge, monitor, width);
            PushDockState();
            return;
        }

        _dock ??= new AppBarDock(this);
        var e = string.Equals(edge, "left", StringComparison.OrdinalIgnoreCase)
            ? AppBarDock.Edge.Left : AppBarDock.Edge.Right;

        // 도킹 직전의 플로팅 배치를 보존해 둔다 — 해제 시 돌아갈 자리.
        if (!IsDocked) PersistFloatingGeometry();

        TopMost = true;                        // 도킹 바는 항상 위(전체화면 앱 뜨면 AppBarDock 이 내려준다)
        ApplyCornerPreference(rounded: false); // 화면 가장자리에 붙으므로 라운딩 해제
        _dock.Dock(e, monitor ?? string.Empty, width);
        PersistDock(true, edge, monitor, _dock.CurrentWidth);
        PushDockState();
    }

    // 도킹 해제 → 저장돼 있던 플로팅 위치·크기로 복귀.
    private void RestoreFloating()
    {
        var c = BootstrapConfig.Load();
        var w = c.WidgetWidth > 100 ? (int)c.WidgetWidth : 360;
        var h = c.WidgetHeight > 100 ? (int)c.WidgetHeight : 560;
        Size = new Size(w, h);
        Location = ComputeLocation(c);
        TopMost = c.WidgetPinned;
    }

    private void ApplyCornerPreference(bool rounded)
    {
        try
        {
            int pref = rounded ? DWMWCP_ROUND : DWMWCP_DONOTROUND;
            DwmSetWindowAttribute(Handle, DWMWA_WINDOW_CORNER_PREFERENCE, ref pref, sizeof(int));
        }
        catch { /* 구버전 Windows */ }
    }

    // 도킹 상태 + 모니터 목록을 위젯 웹으로 push (설정 UI 가 그대로 그린다).
    private void PushDockState()
    {
        var c = BootstrapConfig.Load();
        var monitors = Screen.AllScreens.Select((s, i) => new
        {
            id = s.DeviceName,
            label = s.Primary ? $"모니터 {i + 1} (주)" : $"모니터 {i + 1}",
            primary = s.Primary,
            width = s.Bounds.Width,
            height = s.Bounds.Height,
        }).ToArray();

        var payload = JsonSerializer.Serialize(new
        {
            type = "widgetDockState",
            docked = IsDocked,
            edge = c.WidgetDockEdge,
            monitorId = c.WidgetDockMonitor,
            width = (int)c.WidgetDockWidth,
            maxWidth = AppBarDock.ResolveScreen(c.WidgetDockMonitor).Bounds.Width / 2,
            minWidth = AppBarDock.MinWidth,
            monitors,
        });
        PushToWeb(payload);
    }

    private void PersistDock(bool docked, string? edge, string? monitor, int width)
    {
        try
        {
            var c = BootstrapConfig.Load();
            c.WidgetDockMode = docked ? "appbar" : "floating";
            if (!string.IsNullOrEmpty(edge)) c.WidgetDockEdge = edge.ToLowerInvariant();
            if (monitor is not null) c.WidgetDockMonitor = monitor;
            if (width > 0) c.WidgetDockWidth = width;
            BootstrapConfig.Save(c);
        }
        catch (System.Exception ex)
        {
            DesktopLog.Write($"[widget-dock-persist-err] {ex.Message}");
        }
    }

    // 지금의 창 배치를 '플로팅 배치' 로 저장 (도킹 진입 직전에만).
    private void PersistFloatingGeometry()
    {
        try
        {
            if (WindowState != FormWindowState.Normal || !Visible) return;
            var c = BootstrapConfig.Load();
            c.WidgetX = Location.X;
            c.WidgetY = Location.Y;
            c.WidgetWidth = Width;
            c.WidgetHeight = Height;
            BootstrapConfig.Save(c);
        }
        catch { /* best effort */ }
    }

    protected override void WndProc(ref Message m)
    {
        // 앱바 알림(ABN_POSCHANGED / ABN_FULLSCREENAPP 등)을 먼저 태운다.
        if (_dock is not null && _dock.HandleMessage(ref m)) return;

        switch (m.Msg)
        {
            case WM_DISPLAYCHANGE:
                // 모니터 구성이 바뀌었다(해상도·연결·분리) → 대상 모니터를 다시 해석해 재배치.
                if (IsDocked) { _dock!.Reposition(); PushDockState(); }
                break;

            case WM_EXITSIZEMOVE:
                // 도킹 중 안쪽 모서리를 끌어 폭을 바꿨다 → 확정 폭으로 다시 예약.
                if (IsDocked)
                {
                    _dock!.Dock(_dock.CurrentEdge, _dock.CurrentDeviceName, Width);
                    PersistDock(true, _dock.CurrentEdge.ToString().ToLowerInvariant(), _dock.CurrentDeviceName, _dock.CurrentWidth);
                    PushDockState();
                }
                break;
        }

        base.WndProc(ref m);
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
            ExternalLinkHandler.Attach(_webView.CoreWebView2);
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
        ApplyCornerPreference(rounded: true);
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        // 저장된 도킹 상태 복원 — 핸들이 살아 있어야 SHAppBarMessage 를 걸 수 있으므로 Shown 이후.
        ApplyDockFromConfig();
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
                    // 도킹 중엔 항상 위가 강제 — 핀 토글은 플로팅에서만 의미가 있다.
                    if (!IsDocked && doc.RootElement.TryGetProperty("pinned", out var pinEl))
                    {
                        TopMost = pinEl.GetBoolean();
                        PersistState();
                    }
                    break;
                case "beginWidgetDrag":
                    // 도킹 중엔 창을 못 옮긴다(가장자리에 예약돼 있다). 무시.
                    if (!IsDocked) BeginNativeDrag();
                    break;
                case "beginWidgetResize":
                    BeginNativeResize();
                    break;
                case "setWidgetWidth":
                    if (doc.RootElement.TryGetProperty("width", out var wEl))
                    {
                        var w = Math.Max(MinimumSize.Width, wEl.GetInt32());
                        if (IsDocked)
                        {
                            // 도킹 중 폭 변경 = 예약 폭 변경. 창만 늘리면 작업 영역과 어긋난다.
                            _dock!.Dock(_dock.CurrentEdge, _dock.CurrentDeviceName, w);
                            PersistDock(true, _dock.CurrentEdge.ToString().ToLowerInvariant(), _dock.CurrentDeviceName, _dock.CurrentWidth);
                            PushDockState();
                        }
                        else
                        {
                            Width = w;
                            PersistState();
                        }
                    }
                    break;
                case "getWidgetDock":
                    PushDockState();
                    break;
                case "setWidgetDock":
                    {
                        var r = doc.RootElement;
                        var enabled = r.TryGetProperty("docked", out var dEl) && dEl.GetBoolean();
                        var edge = r.TryGetProperty("edge", out var eEl) ? eEl.GetString() : null;
                        var mon = r.TryGetProperty("monitorId", out var mEl) ? mEl.GetString() : null;
                        var cfg = BootstrapConfig.Load();
                        var width = r.TryGetProperty("width", out var dwEl) ? dwEl.GetInt32() : (int)cfg.WidgetDockWidth;
                        SetDock(enabled, edge ?? cfg.WidgetDockEdge, mon ?? cfg.WidgetDockMonitor, width);
                    }
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

    // 프레임리스 + WebView2 가 가장자리를 덮어 NCHITTEST 가 안 잡히므로 OS 리사이즈 루프를 명시적으로 시작.
    // 도킹 중엔 '안쪽' 모서리만 끌 수 있다(왼쪽 도킹이면 오른쪽 변, 오른쪽 도킹이면 왼쪽 변) → 폭만 바뀐다.
    private void BeginNativeResize()
    {
        try
        {
            int hit = HTBOTTOMRIGHT;
            if (IsDocked)
                hit = _dock!.CurrentEdge == AppBarDock.Edge.Left ? HTRIGHT : HTLEFT;
            ReleaseCapture();
            SendMessage(Handle, WM_NCLBUTTONDOWN, (IntPtr)hit, IntPtr.Zero);
        }
        catch { /* best effort */ }
    }

    private void PersistState()
    {
        try
        {
            var c = BootstrapConfig.Load();
            // ⚠ 도킹 중의 창 배치(화면 가장자리 전체 높이)를 플로팅 배치로 저장하면 안 된다.
            // 저장해 버리면 도킹을 해제해도 돌아갈 원래 자리가 사라진다.
            if (!IsDocked && WindowState == FormWindowState.Normal && Visible)
            {
                c.WidgetX = Location.X;
                c.WidgetY = Location.Y;
                c.WidgetWidth = Width;
                c.WidgetHeight = Height;
            }
            c.WidgetOpacity = _widgetOpacity;
            if (!IsDocked) c.WidgetPinned = TopMost;   // 도킹 중 TopMost 는 강제값이라 사용자 취향이 아니다
            BootstrapConfig.Save(c);
        }
        catch (System.Exception ex)
        {
            DesktopLog.Write($"[widget-persist-err] {ex.Message}");
        }
    }

    // ---------- Win32 ----------
    private const int WM_NCLBUTTONDOWN = 0x00A1;
    private const int WM_DISPLAYCHANGE = 0x007E;
    private const int WM_EXITSIZEMOVE = 0x0232;
    private const int HTCAPTION = 0x0002;
    private const int HTLEFT = 0x000A;
    private const int HTRIGHT = 0x000B;
    private const int HTBOTTOMRIGHT = 0x0011;
    private const int DWMWA_WINDOW_CORNER_PREFERENCE = 33;
    private const int DWMWCP_DONOTROUND = 1;
    private const int DWMWCP_ROUND = 2;

    [DllImport("user32.dll")] private static extern bool ReleaseCapture();
    [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
    [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);
}
