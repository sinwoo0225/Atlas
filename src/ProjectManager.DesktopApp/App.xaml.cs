using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows;
using ProjectManager.AppHost.Services;

namespace ProjectManager.DesktopApp;

public partial class App : System.Windows.Application
{
    // 인스톨러(Inno Setup)의 AppMutex 와 동일한 이름. 업그레이드 설치 시 실행 중 Atlas 를
    // Inno 가 이 뮤텍스로 감지해 자동 종료시킨다. 부수효과로 중복 실행도 방지.
    private const string MutexName = "Atlas-SingleInstance";

    // 프로세스 수명 동안 보유해야 하므로 필드로 — GC 가 회수해 뮤텍스가 풀리지 않게.
    private Mutex? _mutex;

    // 명시적 AppUserModelID — 인스톨러 바로가기로 실행돼도 작업표시줄 버튼이 바로가기/exe 임베드
    // 아이콘이 아닌 *프로세스 자신*에 묶이게 해, 런타임에 ApplyIcon 으로 바꾼 창 아이콘이 작업표시줄에
    // 반영되도록 한다. Inno 바로가기(Atlas.iss [Icons])도 같은 AUMID 를 선언해 일관성 유지.
    private const string AppUserModelId = "SlnU.Atlas";

    protected override void OnStartup(StartupEventArgs e)
    {
        // MSIX(스토어) 빌드는 패키지 매니페스트가 AUMID·작업표시줄 정체성을 정한다 —
        // 명시 호출은 패키지 정체성과 충돌(토스트/작업표시줄 통합 깨짐) 가능하므로 비패키지에서만.
        if (!AppPackaging.IsPackaged)
        {
            try { SetCurrentProcessExplicitAppUserModelID(AppUserModelId); }
            catch { /* 구형 Windows 등에서 실패해도 앱 시작은 막지 않음 */ }
        }

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

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SetCurrentProcessExplicitAppUserModelID(
        [MarshalAs(UnmanagedType.LPWStr)] string appID);
}
