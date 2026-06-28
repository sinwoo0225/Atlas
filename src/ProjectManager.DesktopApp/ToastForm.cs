using System.Collections.Generic;
using System.Drawing;
using System.Net.Http;
using System.Text.Json;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace ProjectManager.DesktopApp;

// 최소화 시에도 보이는 알림 토스트 창. 프레임리스 + always-on-top + 무활성(WS_EX_NOACTIVATE) +
// 투명 배경(TransparencyKey). 우리 소유 창이라 Windows 알림 센터(Action Center)에는 기록되지 않는다.
// 메인 창과 같은 CoreWebView2Environment 를 공유해 테마·언어(localStorage)가 그대로 유지된다.
// 본문은 /notify-toast 라우트(React)가 그리고, 호스트는 메인 창에서 받은 payload 를 이 창으로 전달한다.
public sealed class ToastForm : Form
{
    private readonly CoreWebView2Environment _env;
    private readonly Func<HttpClient?> _apiClient;
    private readonly string _wwwroot;
    private readonly Microsoft.Web.WebView2.WinForms.WebView2 _webView;
    private bool _initialized;
    private bool _webReady;
    private readonly Queue<string> _pending = new();

    private static readonly string ToastUrl = "https://atlas.local/notify-toast";
    // 거의 쓰이지 않는 색을 투명키로 — 이 색 픽셀은 완전 투명 + 클릭 통과.
    private static readonly Color TransparentKey = Color.FromArgb(255, 0, 254, 1);

    public ToastForm(CoreWebView2Environment env, Func<HttpClient?> apiClient, string wwwroot)
    {
        _env = env;
        _apiClient = apiClient;
        _wwwroot = wwwroot;

        Text = "Atlas 알림";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        TopMost = true;
        BackColor = TransparentKey;
        TransparencyKey = TransparentKey;
        Size = ComputeSize();
        Location = ComputeLocation();

        _webView = new Microsoft.Web.WebView2.WinForms.WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.Transparent,
        };
        Controls.Add(_webView);
    }

    private static Rectangle WorkArea => Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 720);
    private static Size ComputeSize() { var wa = WorkArea; return new Size(420, wa.Height); }
    private static Point ComputeLocation() { var wa = WorkArea; return new Point(wa.Right - 420, wa.Top); }

    // 포커스를 뺏지 않는 always-on-top 도구창.
    protected override bool ShowWithoutActivation => true;
    protected override CreateParams CreateParams
    {
        get
        {
            const int WS_EX_NOACTIVATE = 0x08000000;
            const int WS_EX_TOOLWINDOW = 0x00000080; // Alt+Tab 목록에서 제외
            var cp = base.CreateParams;
            cp.ExStyle |= WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW;
            return cp;
        }
    }

    protected override async void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        if (_initialized) return;
        _initialized = true;
        try
        {
            await _webView.EnsureCoreWebView2Async(_env);
            _webView.DefaultBackgroundColor = Color.Transparent;
            new WebViewServer(_webView.CoreWebView2, _apiClient, _wwwroot).Attach();
            _webView.CoreWebView2.WebMessageReceived += OnMessage;
            _webView.CoreWebView2.Navigate(ToastUrl);
        }
        catch (System.Exception ex)
        {
            DesktopLog.Write($"[toast-init-err] {ex.GetType().Name}: {ex.Message}");
        }
    }

    // 메인 창에서 전달된 토스트 payload(JSON {type:'showToast', ...}) 를 표시. UI 스레드에서 호출됨.
    public void ShowToast(string json)
    {
        try
        {
            Size = ComputeSize();
            Location = ComputeLocation();
            if (!Visible) Show();
            if (_webReady) SafePost(json);
            else _pending.Enqueue(json); // 웹 준비 전이면 대기 → toastReady 시 flush
        }
        catch (System.Exception ex)
        {
            DesktopLog.Write($"[toast-show-err] {ex.GetType().Name}: {ex.Message}");
        }
    }

    private void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            if (!doc.RootElement.TryGetProperty("type", out var tEl)) return;
            switch (tEl.GetString())
            {
                case "toastReady":
                    _webReady = true;
                    while (_pending.Count > 0) SafePost(_pending.Dequeue());
                    break;
                case "toastEmpty":
                    Hide();
                    break;
            }
        }
        catch (System.Exception ex)
        {
            DesktopLog.Write($"[toast-bridge-err] {ex.GetType().Name}: {ex.Message}");
        }
    }

    private void SafePost(string json)
    {
        try { _webView.CoreWebView2?.PostWebMessageAsJson(json); } catch { }
    }
}
