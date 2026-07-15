using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace ProjectManager.DesktopApp;

// Windows AppBar 등록 — 위젯이 작업표시줄처럼 데스크톱 '작업 영역(work area)'을 예약해,
// 다른 창을 최대화해도 위젯을 덮지 않게 한다.
//
// ⚠ 이 클래스가 다루는 건 OS 전역 상태다. ABM_NEW 로 등록하면 ABM_REMOVE 를 부를 때까지
// 사용자의 작업 영역이 줄어든 채 남는다 — 프로세스가 죽어도 즉시 복구된다는 보장이 없다.
// 그래서 등록/해제 경로를 여기 한 곳에 가둔다. 호출자는 반드시 Dispose/Unregister 를 보장할 것
// (WidgetForm.FormClosing + MainWindow.OnClosing + ProcessExit 3중).
internal sealed class AppBarDock : IDisposable
{
    public enum Edge { Left = ABE_LEFT, Right = ABE_RIGHT }

    private readonly Form _form;
    private readonly uint _callbackMsg;
    private bool _registered;
    private bool _disposed;

    // 현재 도킹 파라미터. Reposition 이 이걸 보고 rect 를 다시 만든다.
    private Edge _edge = Edge.Right;
    private string _deviceName = string.Empty;   // 빈 값 = 주 모니터
    private int _width = 360;

    public bool IsDocked => _registered;
    public Edge CurrentEdge => _edge;
    public int CurrentWidth => _width;
    public string CurrentDeviceName => _deviceName;

    public AppBarDock(Form form)
    {
        _form = form;
        // 앱바 알림(ABN_*)을 받을 메시지 ID. 시스템 전역 고유해야 하므로 RegisterWindowMessage.
        _callbackMsg = RegisterWindowMessage("AtlasWidgetAppBarMsg");
    }

    // 도킹 시작/갱신. 이미 등록돼 있으면 파라미터만 바꿔 재배치한다.
    public void Dock(Edge edge, string deviceName, int width)
    {
        if (_disposed) return;
        _edge = edge;
        _deviceName = deviceName ?? string.Empty;
        _width = Math.Max(MinWidth, Math.Min(MaxWidthFor(_deviceName), width));

        if (!_registered)
        {
            var abd = NewData();
            abd.uCallbackMessage = _callbackMsg;
            if (SHAppBarMessage(ABM_NEW, ref abd) == IntPtr.Zero)
            {
                DesktopLog.Write("[appbar] ABM_NEW 실패 — 도킹 불가");
                return;
            }
            _registered = true;
        }
        Reposition();
    }

    // 도킹 해제 — 작업 영역을 사용자에게 돌려준다. 여러 번 불러도 안전.
    public void Undock()
    {
        if (!_registered) return;
        _registered = false;   // 재진입 방지를 먼저
        try
        {
            var abd = NewData();
            SHAppBarMessage(ABM_REMOVE, ref abd);
        }
        catch (Exception ex)
        {
            DesktopLog.Write($"[appbar] ABM_REMOVE 실패: {ex.Message}");
        }
    }

    // 현재 파라미터로 rect 를 다시 계산해 예약 + 창 이동.
    // 표준 시퀀스: QUERYPOS(시스템이 다른 앱바를 피해 조정) → 우리 폭을 다시 강제 → SETPOS → MoveWindow.
    public void Reposition()
    {
        if (!_registered || _disposed) return;

        var screen = ResolveScreen(_deviceName);
        var b = screen.Bounds;                      // 물리 픽셀 (PerMonitorV2 프로세스)
        var width = Math.Max(MinWidth, Math.Min(b.Width / 2, _width));

        var abd = NewData();
        abd.uEdge = (uint)_edge;
        abd.rc = new RECT
        {
            Left = b.Left,
            Top = b.Top,
            Right = b.Right,
            Bottom = b.Bottom,
        };
        // 우리가 정하는 건 폭뿐 — 세로는 모니터 전체.
        if (_edge == Edge.Left) abd.rc.Right = b.Left + width;
        else abd.rc.Left = b.Right - width;

        SHAppBarMessage(ABM_QUERYPOS, ref abd);

        // QUERYPOS 는 '우리 축'만 밀어준다(예: 좌측 작업표시줄이 있으면 Left 를 오른쪽으로).
        // 밀린 결과에 우리 폭을 다시 적용해야 폭이 유지된다. (고전 AppBar 샘플의 정석)
        if (_edge == Edge.Left) abd.rc.Right = abd.rc.Left + width;
        else abd.rc.Left = abd.rc.Right - width;

        SHAppBarMessage(ABM_SETPOS, ref abd);

        var r = abd.rc;
        MoveWindow(_form.Handle, r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top, true);
    }

    // WidgetForm.WndProc 에서 먼저 태운다. 처리했으면 true.
    public bool HandleMessage(ref Message m)
    {
        if (_disposed || !_registered) return false;

        if (m.Msg == _callbackMsg)
        {
            switch ((int)m.WParam)
            {
                case ABN_POSCHANGED:
                    // 작업표시줄/다른 앱바가 움직였다 → 우리 자리를 다시 잡는다.
                    Reposition();
                    return true;

                case ABN_FULLSCREENAPP:
                    // 전체화면 앱(게임·영상)이 뜨면 앱바는 비켜줘야 한다. 안 그러면 게임 위에 띠가 남는다.
                    var fullscreen = m.LParam != IntPtr.Zero;
                    SetWindowPos(_form.Handle, fullscreen ? HWND_BOTTOM : HWND_TOPMOST,
                        0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                    return true;

                case ABN_STATECHANGE:
                case ABN_WINDOWARRANGE:
                    return true;   // 특별히 할 일 없음(삼켜서 기본 처리 회피)
            }
            return false;
        }

        switch (m.Msg)
        {
            case WM_WINDOWPOSCHANGED:
                { var abd = NewData(); SHAppBarMessage(ABM_WINDOWPOSCHANGED, ref abd); }
                break;
            case WM_ACTIVATE:
                { var abd = NewData(); SHAppBarMessage(ABM_ACTIVATE, ref abd); }
                break;
        }
        return false;   // 위 둘은 알린 뒤 기본 처리도 계속돼야 한다
    }

    // 모니터 해석 — 저장된 DeviceName 우선, 없거나 사라졌으면 주 모니터로 폴백.
    // (모니터를 뽑았는데 그 자리에 계속 예약하려 들면 창이 화면 밖으로 나간다.)
    public static Screen ResolveScreen(string deviceName)
    {
        if (!string.IsNullOrEmpty(deviceName))
        {
            foreach (var s in Screen.AllScreens)
                if (string.Equals(s.DeviceName, deviceName, StringComparison.OrdinalIgnoreCase))
                    return s;
            DesktopLog.Write($"[appbar] 모니터 '{deviceName}' 없음 → 주 모니터로 폴백");
        }
        return Screen.PrimaryScreen ?? Screen.AllScreens[0];
    }

    // 화면 절반을 넘는 도킹 폭은 막는다 — 위젯이 데스크톱을 잡아먹는 사고 방지.
    private static int MaxWidthFor(string deviceName) => Math.Max(MinWidth, ResolveScreen(deviceName).Bounds.Width / 2);

    private APPBARDATA NewData() => new()
    {
        cbSize = Marshal.SizeOf<APPBARDATA>(),
        hWnd = _form.Handle,
    };

    public void Dispose()
    {
        if (_disposed) return;
        Undock();
        _disposed = true;
    }

    // ---------- Win32 ----------
    public const int MinWidth = 240;

    private const int ABM_NEW = 0x00000000;
    private const int ABM_REMOVE = 0x00000001;
    private const int ABM_QUERYPOS = 0x00000002;
    private const int ABM_SETPOS = 0x00000003;
    private const int ABM_ACTIVATE = 0x00000006;
    private const int ABM_WINDOWPOSCHANGED = 0x00000009;

    private const int ABE_LEFT = 0;
    private const int ABE_RIGHT = 2;

    private const int ABN_STATECHANGE = 0x0000;
    private const int ABN_POSCHANGED = 0x0001;
    private const int ABN_FULLSCREENAPP = 0x0002;
    private const int ABN_WINDOWARRANGE = 0x0003;

    private const int WM_ACTIVATE = 0x0006;
    private const int WM_WINDOWPOSCHANGED = 0x0047;

    private static readonly IntPtr HWND_TOPMOST = new(-1);
    private static readonly IntPtr HWND_BOTTOM = new(1);
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOACTIVATE = 0x0010;

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    private struct APPBARDATA
    {
        public int cbSize;
        public IntPtr hWnd;
        public uint uCallbackMessage;
        public uint uEdge;
        public RECT rc;
        public IntPtr lParam;
    }

    [DllImport("shell32.dll", CallingConvention = CallingConvention.StdCall)]
    private static extern IntPtr SHAppBarMessage(int dwMessage, ref APPBARDATA pData);

    [DllImport("user32.dll")]
    private static extern uint RegisterWindowMessage(string lpString);

    [DllImport("user32.dll")]
    private static extern bool MoveWindow(IntPtr hWnd, int x, int y, int w, int h, bool repaint);

    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);
}
