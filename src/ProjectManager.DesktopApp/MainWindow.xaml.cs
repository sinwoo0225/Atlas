using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace ProjectManager.DesktopApp;

public partial class MainWindow : Window
{
    private Process? _backendProcess;
    private const int BackendPort = 5200;
    private static readonly string BackendUrl = $"http://localhost:{BackendPort}";

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
        StartBackend();
        if (await WaitForBackendAsync())
            await InitializeWebViewAsync();
    }

    private void StartBackend()
    {
        var exeDir = AppContext.BaseDirectory;
        var backendExe = Path.Combine(exeDir, "ProjectManager.WebService.exe");

        if (!File.Exists(backendExe))
        {
            StatusText.Text = $"백엔드를 찾을 수 없습니다:\n{backendExe}";
            return;
        }

        _backendProcess = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = backendExe,
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = exeDir,
            }
        };
        _backendProcess.Start();
    }

    private async Task<bool> WaitForBackendAsync()
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        for (var i = 0; i < 40; i++)
        {
            StatusText.Text = $"서버 시작 중... ({i + 1})";
            try
            {
                var resp = await http.GetAsync($"{BackendUrl}/api/health");
                if (resp.IsSuccessStatusCode) return true;
            }
            catch { }
            await Task.Delay(500);
        }
        MessageBox.Show("백엔드 서버 시작에 실패했습니다.", "오류", MessageBoxButton.OK, MessageBoxImage.Error);
        return false;
    }

    private async Task InitializeWebViewAsync()
    {
        await WebView.EnsureCoreWebView2Async();
        WebView.CoreWebView2.Navigate(BackendUrl);
        LoadingOverlay.Visibility = Visibility.Collapsed;
    }

    private void OnClosing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        try { _backendProcess?.Kill(entireProcessTree: true); } catch { }
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
