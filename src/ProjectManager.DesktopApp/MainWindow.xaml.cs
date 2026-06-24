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
using ProjectManager.Infrastructure.Config;

namespace ProjectManager.DesktopApp;

public partial class MainWindow : Window
{
    private InProcessHost? _host;
    // 두 모드 공통: /api/* 요청을 어디로 보낼지. Local 모드는 _host.Client, Client 모드는 원격 Atlas-Server.
    private HttpClient? _apiClient;
    private bool _ownsApiClient; // Client 모드에서 우리가 직접 만든 HttpClient 면 Dispose 해야 함.
    private string _wwwroot = "";
    private const string VirtualHost = "atlas.local";
    private static readonly string AppUrl = $"https://{VirtualHost}/index.html";

    // 위젯(보조 always-on-top 창) — 메인 WebView2 의 환경·apiClient·wwwroot 를 공유. WinForms Form 으로 호스팅.
    private CoreWebView2Environment? _env;
    private WidgetForm? _widget;

    public MainWindow()
    {
        InitializeComponent();
        // 로딩 오버레이가 보이기 전에 직전 실행의 테마색·브랜드(워드마크·제목)를 미리 적용.
        ApplyPersistedTheme();
        ApplyPersistedBrand();
        Loaded += OnLoaded;
        Closing += OnClosing;
    }

    protected override void OnSourceInitialized(System.EventArgs e)
    {
        base.OnSourceInitialized(e);
        var source = (HwndSource)PresentationSource.FromVisual(this)!;
        _hwnd = source.Handle;
        source.AddHook(WndProc);

        // 전역 단축키 Ctrl+Alt+W → 위젯 토글. 다른 앱이 선점했으면 조용히 실패(앱 시작은 막지 않음).
        try { _hotkeyRegistered = RegisterHotKey(_hwnd, HotkeyId, MOD_CONTROL | MOD_ALT, VK_W); }
        catch { _hotkeyRegistered = false; }
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        try
        {
            var bootstrap = BootstrapConfig.Load();
            if (string.Equals(bootstrap.Mode, "Client", StringComparison.OrdinalIgnoreCase)
                && !string.IsNullOrWhiteSpace(bootstrap.ServerUrl))
            {
                // Client 모드: 인프로세스 호스팅 없음. 원격 서버로만 프록시.
                _apiClient = BuildRemoteClient(bootstrap.ServerUrl!, bootstrap.ApiKey);
                _ownsApiClient = true;
            }
            else
            {
                // Local 모드 (기본): TestServer 기반 인프로세스 호스팅.
                _host = new InProcessHost();
                await _host.StartAsync();
                _apiClient = _host.Client;
                _ownsApiClient = false;
            }
            await InitializeWebViewAsync();
        }
        catch (System.Exception ex)
        {
            StatusText.Text = $"앱 시작 실패:\n{ex.Message}";
            MessageBox.Show(ex.ToString(), "오류", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private static HttpClient BuildRemoteClient(string serverUrl, string? apiKey)
    {
        var client = new HttpClient
        {
            BaseAddress = new Uri(serverUrl.TrimEnd('/') + "/"),
            // 일부 요청(백업 zip 다운로드 등)이 길어질 수 있으니 넉넉하게.
            Timeout = TimeSpan.FromMinutes(10),
        };
        if (!string.IsNullOrWhiteSpace(apiKey))
            client.DefaultRequestHeaders.Add("X-Atlas-Key", apiKey);
        return client;
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
        // 위젯 창의 레이어드 투명도(LWA_ALPHA)가 WebView2 콘텐츠에도 적용되려면 GPU 컴포지팅을 꺼야 한다.
        // (GPU 스왑체인은 창 레이어드 알파를 우회 — 끄면 창 표면에 그려져 DWM 이 알파와 함께 합성)
        // 메인 창도 같은 환경을 공유하나 렌더링은 정상(CPU 컴포지팅 경로).
        var envOptions = new CoreWebView2EnvironmentOptions { AdditionalBrowserArguments = "--disable-gpu-compositing" };
        _env = await CoreWebView2Environment.CreateAsync(null, userDataFolder, envOptions);
        await WebView.EnsureCoreWebView2Async(_env);

        // single-file 환경에서 실제 exe 옆 폴더(= wwwroot) 를 정적파일 소스로 잡는다.
        var exeDir = Path.GetDirectoryName(Environment.ProcessPath) ?? AppContext.BaseDirectory;
        _wwwroot = Path.Combine(exeDir, "wwwroot");

        // atlas.local/* 정적파일 서빙 + /api 프록시는 WebViewServer 로 위임(위젯 창과 공유).
        new WebViewServer(WebView.CoreWebView2, () => _apiClient, _wwwroot).Attach();

        // 프론트엔드 ↔ WPF 호스트 메시지 브릿지(네이티브 다이얼로그·연결설정·브랜드·위젯 토글).
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
            else if (type == "getConnectionConfig")
            {
                // 로컬 머신의 BootstrapConfig 를 그대로 반환. SettingsPage 가 API 가 아닌
                // 호스트 브릿지를 거쳐야 하는 이유: Client 모드에서 SettingsPage 의 일반 API 호출은
                // 원격 서버로 라우팅되어 서버 측 config 를 건드리게 된다. 연결 설정은 항상 클라 로컬.
                var requestId = doc.RootElement.TryGetProperty("requestId", out var rid) ? rid.GetString() : null;
                var cfg = BootstrapConfig.Load();
                var response = JsonSerializer.Serialize(new
                {
                    type = "getConnectionConfigResult",
                    requestId,
                    mode = cfg.Mode,
                    serverUrl = cfg.ServerUrl,
                    apiKey = cfg.ApiKey,
                });
                WebView.CoreWebView2.PostWebMessageAsJson(response);
            }
            else if (type == "setConnectionConfig")
            {
                var requestId = doc.RootElement.TryGetProperty("requestId", out var rid) ? rid.GetString() : null;
                var newMode = doc.RootElement.TryGetProperty("mode", out var mEl) ? mEl.GetString() : "Local";
                var newUrl = doc.RootElement.TryGetProperty("serverUrl", out var uEl) ? uEl.GetString() : null;
                var newKey = doc.RootElement.TryGetProperty("apiKey", out var kEl) ? kEl.GetString() : null;

                var cfg = BootstrapConfig.Load();
                cfg.Mode = string.Equals(newMode, "Client", StringComparison.OrdinalIgnoreCase) ? "Client" : "Local";
                cfg.ServerUrl = string.IsNullOrWhiteSpace(newUrl) ? null : newUrl!.Trim().TrimEnd('/');
                cfg.ApiKey = string.IsNullOrEmpty(newKey) ? null : newKey;
                BootstrapConfig.Save(cfg);

                var response = JsonSerializer.Serialize(new
                {
                    type = "setConnectionConfigResult",
                    requestId,
                    saved = true,
                    requiresRestart = true,
                });
                WebView.CoreWebView2.PostWebMessageAsJson(response);
            }
            else if (type == "testServerConnection")
            {
                var requestId = doc.RootElement.TryGetProperty("requestId", out var rid) ? rid.GetString() : null;
                var url = doc.RootElement.TryGetProperty("url", out var uEl) ? uEl.GetString() : null;
                var key = doc.RootElement.TryGetProperty("apiKey", out var kEl) ? kEl.GetString() : null;

                // fire-and-forget: 결과는 PostWebMessageAsJson 으로 회신.
                _ = TestServerConnectionAsync(requestId, url, key);
            }
            else if (type == "getMachineAccount")
            {
                // 작성자 자동 추적용: Settings.defaultAuthor 가 비어 있을 때 첫 부팅 시 한 번 시드한다.
                // Client 모드여도 *클라이언트* 머신의 계정명을 반환 — 그래야 서버가 actor 를 구분할 수 있다.
                var requestId = doc.RootElement.TryGetProperty("requestId", out var rid) ? rid.GetString() : null;
                var response = JsonSerializer.Serialize(new
                {
                    type = "getMachineAccountResult",
                    requestId,
                    userName = Environment.UserName,
                });
                WebView.CoreWebView2.PostWebMessageAsJson(response);
            }
            else if (type == "launchDictation")
            {
                // Windows 음성 입력(받아쓰기) 토글 = Win+H. 웹은 OS 전역 단축키를 못 보내므로
                // 호스트가 키 입력을 합성한다. 입력은 현재 포커스된 편집 컨트롤(논의내용 textarea)로 들어간다.
                SendWinH();
            }
            else if (type == "setBrand")
            {
                // 프론트 브랜드 설정 → 네이티브 커스텀 제목 표시줄 워드마크 + OS 창 제목(작업표시줄·Alt+Tab).
                // 제목 표시줄은 XAML 이라 document.title 로 못 바꾸므로 호스트가 직접 갱신한다.
                var primaryText = doc.RootElement.TryGetProperty("primaryText", out var ptEl) ? ptEl.GetString() : null;
                var accentText = doc.RootElement.TryGetProperty("accentText", out var atEl) ? atEl.GetString() : null;
                var primaryColor = doc.RootElement.TryGetProperty("primaryColor", out var pcEl) ? pcEl.GetString() : null;
                var accentColor = doc.RootElement.TryGetProperty("accentColor", out var acEl) ? acEl.GetString() : null;
                var brandTitle = doc.RootElement.TryGetProperty("title", out var btEl) ? btEl.GetString() : null;
                var iconDataUrl = doc.RootElement.TryGetProperty("iconDataUrl", out var icEl) ? icEl.GetString() : null;
                ApplyBrand(primaryText, accentText, primaryColor, accentColor, brandTitle);
                ApplyIcon(iconDataUrl);
                PersistBrand(primaryText, accentText, primaryColor, accentColor, brandTitle, iconDataUrl);
            }
            else if (type == "setTheme")
            {
                // 프론트 인앱 테마(라이트/다크/커스텀) 색 → 커스텀 WPF 제목 표시줄·창·캡션 버튼.
                // 웹 CSS 는 WebView2 콘텐츠만 칠하므로, 그 바깥 XAML 크롬은 호스트가 직접 따라 칠한다.
                var bg = doc.RootElement.TryGetProperty("bg", out var bgEl) ? bgEl.GetString() : null;
                var fg = doc.RootElement.TryGetProperty("fg", out var fgEl) ? fgEl.GetString() : null;
                var fgStrong = doc.RootElement.TryGetProperty("fgStrong", out var fsEl) ? fsEl.GetString() : null;
                var hoverBg = doc.RootElement.TryGetProperty("hoverBg", out var hbEl) ? hbEl.GetString() : null;
                var border = doc.RootElement.TryGetProperty("border", out var bdEl) ? bdEl.GetString() : null;
                ApplyTheme(bg, fg, fgStrong, hoverBg, border);
                PersistTheme(bg, fg, fgStrong, hoverBg, border);
            }
            else if (type == "toggleWidget")
            {
                ToggleWidget();
            }
            else if (type == "showWidget")
            {
                ShowWidget();
            }
            else if (type == "hideWidget")
            {
                _widget?.Hide();
            }
        }
        catch (System.Exception ex)
        {
            TryLog($"[host-bridge-err] {ex.GetType().Name}: {ex.Message}");
        }
    }

    // ---------- 위젯 창 토글 ----------
    private void ToggleWidget()
    {
        if (_widget is { Visible: true })
            _widget.Hide();
        else
            ShowWidget();
    }

    private void ShowWidget()
    {
        if (_env is null || WebView.CoreWebView2 is null) return; // WebView 초기화 전이면 무시
        _widget ??= new WidgetForm(_env, () => _apiClient, _wwwroot);
        if (!_widget.Visible) _widget.Show();
        _widget.Activate();
    }

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    // Win+H 합성: LWIN↓ H↓ H↑ LWIN↑. (keybd_event 는 단발 조합엔 충분)
    private static void SendWinH()
    {
        const byte VK_LWIN = 0x5B;
        const byte VK_H = 0x48;
        const uint KEYEVENTF_KEYUP = 0x0002;
        keybd_event(VK_LWIN, 0, 0, UIntPtr.Zero);
        keybd_event(VK_H, 0, 0, UIntPtr.Zero);
        keybd_event(VK_H, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(VK_LWIN, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    // 커스텀 제목 표시줄 + 로딩 오버레이 워드마크(Run 텍스트·색) + OS 창 제목을 갱신.
    // WebMessageReceived(런타임)·생성자(시작) 양쪽에서 호출. UI 스레드 직접 접근.
    private void ApplyBrand(string? primaryText, string? accentText, string? primaryColor, string? accentColor, string? title)
    {
        var pBrush = TryBrush(primaryColor);
        var aBrush = TryBrush(accentColor);

        if (!string.IsNullOrEmpty(primaryText))
        {
            if (BrandPrimaryRun is not null) BrandPrimaryRun.Text = primaryText;
            if (LoadingPrimaryRun is not null) LoadingPrimaryRun.Text = primaryText;
        }
        if (!string.IsNullOrEmpty(accentText))
        {
            if (BrandAccentRun is not null) BrandAccentRun.Text = accentText;
            if (LoadingAccentRun is not null) LoadingAccentRun.Text = accentText;
        }
        if (pBrush is not null)
        {
            if (BrandPrimaryRun is not null) BrandPrimaryRun.Foreground = pBrush;
            if (LoadingPrimaryRun is not null) LoadingPrimaryRun.Foreground = pBrush;
        }
        if (aBrush is not null)
        {
            if (BrandAccentRun is not null) BrandAccentRun.Foreground = aBrush;
            if (LoadingAccentRun is not null) LoadingAccentRun.Foreground = aBrush;
        }
        if (!string.IsNullOrWhiteSpace(title)) Title = title!;
    }

    // 시작 시: 직전 실행에서 저장해 둔 브랜드를 프론트 로드 전에 미리 적용
    // (로딩 오버레이는 WebView2 전에 보이므로 config.json 값으로 칠한다).
    private void ApplyPersistedBrand()
    {
        try
        {
            var c = BootstrapConfig.Load();
            ApplyBrand(c.BrandPrimaryText, c.BrandAccentText, c.BrandPrimaryColor, c.BrandAccentColor, c.BrandTitle);
            // 저장된 앱 아이콘이 있으면 프론트 로드 전에 미리 창 아이콘으로 적용 (작업표시줄 깜빡임 제거).
            // 없으면 기본 아이콘을 *큰 프레임*으로 명시 적용 — XAML 의 Icon=atlas.ico 는 16px 프레임이
            // 집혀 작업표시줄에서 작게 보이므로 시작 시 교정.
            if (!string.IsNullOrWhiteSpace(c.BrandIconDataUrl)) ApplyIcon(c.BrandIconDataUrl);
            else ApplyIcon(null);
        }
        catch (System.Exception ex)
        {
            TryLog($"[persisted-brand-err] {ex.Message}");
        }
    }

    // 프론트가 보낸 브랜드를 config.json 에 저장 — 다음 실행 시 ApplyPersistedBrand 가 읽음.
    // 값이 그대로면 디스크를 건드리지 않는다(setBrand 는 부팅·저장마다 발화하므로 churn 방지).
    private void PersistBrand(string? primaryText, string? accentText, string? primaryColor, string? accentColor, string? title, string? iconDataUrl)
    {
        try
        {
            var c = BootstrapConfig.Load();
            if (c.BrandPrimaryText == primaryText && c.BrandAccentText == accentText
                && c.BrandPrimaryColor == primaryColor && c.BrandAccentColor == accentColor
                && c.BrandTitle == title && c.BrandIconDataUrl == iconDataUrl)
                return;
            c.BrandPrimaryText = primaryText;
            c.BrandAccentText = accentText;
            c.BrandPrimaryColor = primaryColor;
            c.BrandAccentColor = accentColor;
            c.BrandTitle = title;
            c.BrandIconDataUrl = iconDataUrl;
            BootstrapConfig.Save(c);
        }
        catch (System.Exception ex)
        {
            TryLog($"[persist-brand-err] {ex.Message}");
        }
    }

    // 인앱 테마 색 → 커스텀 제목 표시줄·창·캡션 버튼. App.xaml 의 네임드 브러시 리소스를 교체하면
    // DynamicResource 소비처(타이틀바 Border·Window·LoadingOverlay·ChromeButton 스타일)가 라이브 갱신된다.
    // WebMessageReceived(런타임)·생성자(시작) 양쪽에서 호출.
    private void ApplyTheme(string? bg, string? fg, string? fgStrong, string? hoverBg, string? border)
    {
        SetBrushResource("WindowBg", bg);
        SetBrushResource("TitleBarBg", bg);
        SetBrushResource("TitleBarBorder", border);
        SetBrushResource("ChromeFg", fg);
        SetBrushResource("ChromeHoverFg", fgStrong);
        SetBrushResource("ChromeHoverBg", hoverBg);
    }

    // 유효한 hex 만 교체 — 빈/잘못된 값은 현 색 유지(부분 메시지에도 안전).
    private static void SetBrushResource(string key, string? hex)
    {
        if (TryBrush(hex) is System.Windows.Media.Brush b)
        {
            b.Freeze();
            System.Windows.Application.Current.Resources[key] = b;
        }
    }

    // 시작 시: 직전 실행에서 저장해 둔 테마색을 프론트 로드 전에 미리 적용
    // (로딩 오버레이·제목 표시줄이 WebView2 전에 보이므로 config.json 값으로 칠해 부팅 깜빡임 제거).
    private void ApplyPersistedTheme()
    {
        try
        {
            var c = BootstrapConfig.Load();
            ApplyTheme(c.ThemeBg, c.ThemeFg, c.ThemeFgStrong, c.ThemeHoverBg, c.ThemeBorder);
        }
        catch (System.Exception ex)
        {
            TryLog($"[persisted-theme-err] {ex.Message}");
        }
    }

    // 프론트가 보낸 테마색을 config.json 에 저장 — 다음 실행 시 ApplyPersistedTheme 가 읽음.
    // 값이 그대로면 디스크를 건드리지 않는다(setTheme 는 부팅·전환마다 발화하므로 churn 방지).
    private void PersistTheme(string? bg, string? fg, string? fgStrong, string? hoverBg, string? border)
    {
        try
        {
            var c = BootstrapConfig.Load();
            if (c.ThemeBg == bg && c.ThemeFg == fg && c.ThemeFgStrong == fgStrong
                && c.ThemeHoverBg == hoverBg && c.ThemeBorder == border)
                return;
            c.ThemeBg = bg;
            c.ThemeFg = fg;
            c.ThemeFgStrong = fgStrong;
            c.ThemeHoverBg = hoverBg;
            c.ThemeBorder = border;
            BootstrapConfig.Save(c);
        }
        catch (System.Exception ex)
        {
            TryLog($"[persist-theme-err] {ex.Message}");
        }
    }

    private static System.Windows.Media.Brush? TryBrush(string? hex)
    {
        if (string.IsNullOrWhiteSpace(hex)) return null;
        try
        {
            var color = (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString(hex);
            return new System.Windows.Media.SolidColorBrush(color);
        }
        catch { return null; }
    }

    // 기본 atlas.ico 의 *가장 큰* 프레임을 창 아이콘으로 반환.
    // atlas.ico 는 16px 부터 멀티사이즈인데 BitmapImage(pack uri) 는 첫(16px) 프레임만 집어,
    // 명시적 AppUserModelID(사이클 71) 로 작업표시줄이 exe 임베드 아이콘 대신 *창 아이콘*을 쓰게 된 뒤
    // 작업표시줄(대형 슬롯)에서 아이콘이 작게 보였다. 큰 프레임을 주면 타이틀바용 소형은 WPF 가
    // 자동 축소해 양쪽 다 또렷하다.
    private static System.Windows.Media.ImageSource LoadDefaultAppIcon()
    {
        var uri = new Uri("pack://application:,,,/Resources/atlas.ico");
        var decoder = System.Windows.Media.Imaging.BitmapDecoder.Create(
            uri,
            System.Windows.Media.Imaging.BitmapCreateOptions.None,
            System.Windows.Media.Imaging.BitmapCacheOption.OnLoad);
        var best = decoder.Frames[0];
        foreach (var f in decoder.Frames)
            if (f.PixelWidth > best.PixelWidth) best = f;
        return best;
    }

    // 작업표시줄/창 아이콘 갱신. data URL 이면 디코드해 적용, 비어 있으면 기본 atlas.ico(큰 프레임) 복귀.
    // exe 파일 임베드 아이콘(<ApplicationIcon>)과 별개 — 실행 중인 창 아이콘만 바뀐다.
    private void ApplyIcon(string? dataUrl)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(dataUrl))
            {
                Icon = LoadDefaultAppIcon();
                return;
            }

            // "data:image/png;base64,XXXX" → base64 본문만 추출.
            var comma = dataUrl.IndexOf(',');
            if (comma < 0) return;
            var bytes = Convert.FromBase64String(dataUrl[(comma + 1)..]);

            var bmp = new System.Windows.Media.Imaging.BitmapImage();
            bmp.BeginInit();
            bmp.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
            bmp.StreamSource = new MemoryStream(bytes);
            bmp.EndInit();
            bmp.Freeze();
            Icon = bmp;
        }
        catch (System.Exception ex)
        {
            TryLog($"[apply-icon-err] {ex.GetType().Name}: {ex.Message}");
        }
    }

    private async Task TestServerConnectionAsync(string? requestId, string? url, string? apiKey)
    {
        bool ok = false;
        int status = 0;
        string? error = null;
        try
        {
            if (string.IsNullOrWhiteSpace(url))
            {
                error = "서버 URL 이 비어 있습니다.";
            }
            else
            {
                using var client = new HttpClient
                {
                    BaseAddress = new Uri(url!.TrimEnd('/') + "/"),
                    Timeout = TimeSpan.FromSeconds(5),
                };
                var req = new HttpRequestMessage(HttpMethod.Get, "api/system/ping");
                if (!string.IsNullOrWhiteSpace(apiKey))
                    req.Headers.Add("X-Atlas-Key", apiKey);
                using var resp = await client.SendAsync(req);
                status = (int)resp.StatusCode;
                ok = resp.IsSuccessStatusCode;
                if (!ok) error = $"HTTP {status} {resp.ReasonPhrase}";
            }
        }
        catch (System.Exception ex)
        {
            error = ex.Message;
        }

        var response = JsonSerializer.Serialize(new
        {
            type = "testServerConnectionResult",
            requestId,
            ok,
            status,
            error,
        });
        // UI 스레드로 돌아와 PostWebMessageAsJson 호출 — 핸들러는 STA 라 직접 호출 가능.
        try { Dispatcher.Invoke(() => WebView.CoreWebView2.PostWebMessageAsJson(response)); }
        catch { /* 셔다운 등으로 dispatcher 없으면 무시 */ }
    }

    private static void TryLog(string line) => DesktopLog.Write(line);

    private async void OnClosing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        if (_hotkeyRegistered)
        {
            try { UnregisterHotKey(_hwnd, HotkeyId); } catch { }
            _hotkeyRegistered = false;
        }
        if (_widget is not null)
        {
            _widget.Close(); // 위젯이 살아있으면 메인 종료 후에도 프로세스가 남음
            _widget = null;
        }
        if (_ownsApiClient)
        {
            _apiClient?.Dispose();
            _apiClient = null;
        }
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

    // 최대화/복원 상태에 따라 캡션 글리프 토글 (Windows 표준 동작). E922 = 최대화, E923 = 복원.
    protected override void OnStateChanged(System.EventArgs e)
    {
        base.OnStateChanged(e);
        if (MaximizeButton is not null)
            MaximizeButton.Content = WindowState == WindowState.Maximized ? "" : "";
    }

    // ---------- 전역 단축키 (Ctrl+Alt+W → 위젯 토글) ----------
    private IntPtr _hwnd;
    private bool _hotkeyRegistered;
    private const int HotkeyId = 0x9001;
    private const int WM_HOTKEY = 0x0312;
    private const uint MOD_ALT = 0x0001;
    private const uint MOD_CONTROL = 0x0002;
    private const uint VK_W = 0x57;

    [DllImport("user32.dll")] private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
    [DllImport("user32.dll")] private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    // ---------- Taskbar-aware maximize ----------
    private const int WM_GETMINMAXINFO = 0x0024;
    private const int MONITOR_DEFAULTTONEAREST = 0x00000002;

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_HOTKEY && wParam.ToInt32() == HotkeyId)
        {
            ToggleWidget();
            handled = true;
            return IntPtr.Zero;
        }
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
