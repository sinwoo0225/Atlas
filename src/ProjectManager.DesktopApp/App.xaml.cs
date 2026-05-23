using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows;

namespace ProjectManager.DesktopApp;

public partial class App : System.Windows.Application
{
    // 인스톨러(Inno Setup)의 AppMutex 와 동일한 이름. 업그레이드 설치 시 실행 중 Atlas 를
    // Inno 가 이 뮤텍스로 감지해 자동 종료시킨다. 부수효과로 중복 실행도 방지.
    private const string MutexName = "Atlas-SingleInstance";

    // 프로세스 수명 동안 보유해야 하므로 필드로 — GC 가 회수해 뮤텍스가 풀리지 않게.
    private Mutex? _mutex;

    protected override void OnStartup(StartupEventArgs e)
    {
        _mutex = new Mutex(initiallyOwned: true, MutexName, out bool createdNew);
        if (!createdNew)
        {
            // 이미 실행 중 — 기존 창을 앞으로 가져오고 이 인스턴스는 종료.
            ActivateExistingInstance();
            Shutdown();
            return;
        }
        base.OnStartup(e);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        try { _mutex?.ReleaseMutex(); } catch { /* 보유하지 않은 경우 무시 */ }
        _mutex?.Dispose();
        base.OnExit(e);
    }

    private static void ActivateExistingInstance()
    {
        try
        {
            var current = Process.GetCurrentProcess();
            foreach (var p in Process.GetProcessesByName(current.ProcessName))
            {
                if (p.Id == current.Id) continue;
                var h = p.MainWindowHandle;
                if (h == IntPtr.Zero) continue;
                if (IsIconic(h)) ShowWindow(h, SW_RESTORE);
                SetForegroundWindow(h);
                break;
            }
        }
        catch { /* best effort */ }
    }

    private const int SW_RESTORE = 9;

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);
}
