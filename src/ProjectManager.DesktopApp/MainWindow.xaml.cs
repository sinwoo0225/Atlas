using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Windows;

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
}
