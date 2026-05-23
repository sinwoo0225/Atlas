using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

namespace ProjectManager.DesktopApp;

// 포그라운드 창 전환을 추적해 최근 사용 앱·창제목·머문시간을 위젯에 push.
// SetWinEventHook(EVENT_SYSTEM_FOREGROUND, OUTOFCONTEXT) — 콜백이 호출 스레드(UI) 메시지큐로 전달되므로
// 메시지 루프가 있는 UI 스레드에서 생성해야 한다. 창 제목은 이 PC 메모리에만 보관(외부 전송 없음).
internal sealed class ActiveWindowTracker : IDisposable
{
    private const int MaxItems = 6;

    private readonly Action<string> _push;
    private readonly uint _ownPid;
    private readonly WinEventDelegate _proc; // GC 방지용 필드 보관
    private readonly System.Windows.Forms.Timer _tick;

    private IntPtr _hook;
    private bool _enabled;
    private bool _disposed;

    private sealed class Entry { public string App = ""; public string Title = ""; public double Seconds; }
    private readonly List<Entry> _entries = new(); // 최근순(front = 가장 최근)
    private string? _currentApp;
    private DateTime _lastSwitch = DateTime.UtcNow;

    public ActiveWindowTracker(Action<string> push, uint ownPid)
    {
        _push = push;
        _ownPid = ownPid;
        _proc = WinEventProc;
        // 현재 앱의 머문시간이 실시간으로 늘도록 5초마다 갱신 push.
        _tick = new System.Windows.Forms.Timer { Interval = 5000 };
        _tick.Tick += (_, _) => { if (_enabled && _currentApp is not null) { Accrue(); PushState(); } };
    }

    public void SetEnabled(bool enabled)
    {
        if (_disposed || enabled == _enabled) { if (enabled) PushState(); return; }
        _enabled = enabled;
        if (enabled)
        {
            _hook = SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND,
                IntPtr.Zero, _proc, 0, 0, WINEVENT_OUTOFCONTEXT);
            _lastSwitch = DateTime.UtcNow;
            OnForeground(GetForegroundWindow()); // 현재 포그라운드부터 시작
            _tick.Start();
        }
        else
        {
            _tick.Stop();
            if (_hook != IntPtr.Zero) { UnhookWinEvent(_hook); _hook = IntPtr.Zero; }
            _entries.Clear();
            _currentApp = null;
            _push(JsonSerializer.Serialize(new { type = "activeWindowsUpdate", enabled = false, items = Array.Empty<object>() }));
        }
    }

    public void Request() { if (_enabled) PushState(); else _push(JsonSerializer.Serialize(new { type = "activeWindowsUpdate", enabled = false, items = Array.Empty<object>() })); }

    private void WinEventProc(IntPtr hWinEventHook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint dwEventThread, uint dwmsEventTime)
    {
        if (idObject != OBJID_WINDOW || hwnd == IntPtr.Zero) return;
        OnForeground(hwnd);
        PushState();
    }

    private void OnForeground(IntPtr hwnd)
    {
        Accrue(); // 이전 앱 머문시간 정산

        if (hwnd == IntPtr.Zero) { _currentApp = null; return; }
        GetWindowThreadProcessId(hwnd, out uint pid);
        if (pid == _ownPid) { _currentApp = null; return; } // Atlas 자신은 목록에서 제외

        var app = SafeProcessName(pid);
        if (string.IsNullOrEmpty(app)) { _currentApp = null; return; }
        var title = GetTitle(hwnd);

        var entry = _entries.FirstOrDefault(x => x.App == app);
        if (entry is null) { entry = new Entry { App = app }; }
        else { _entries.Remove(entry); }
        entry.Title = string.IsNullOrEmpty(title) ? entry.Title : title;
        _entries.Insert(0, entry);
        if (_entries.Count > MaxItems) _entries.RemoveRange(MaxItems, _entries.Count - MaxItems);

        _currentApp = app;
    }

    // 현재 앱에 경과 시간 가산 후 타이머 리셋.
    private void Accrue()
    {
        var now = DateTime.UtcNow;
        if (_currentApp is not null)
        {
            var e = _entries.FirstOrDefault(x => x.App == _currentApp);
            if (e is not null) e.Seconds += (now - _lastSwitch).TotalSeconds;
        }
        _lastSwitch = now;
    }

    private void PushState()
    {
        if (_disposed || !_enabled) return;
        var items = _entries.Select(e => new { app = e.App, title = e.Title, seconds = (int)Math.Round(e.Seconds) }).ToArray();
        _push(JsonSerializer.Serialize(new { type = "activeWindowsUpdate", enabled = true, items }));
    }

    private static string SafeProcessName(uint pid)
    {
        try { return Process.GetProcessById((int)pid).ProcessName; }
        catch { return ""; }
    }

    private static string GetTitle(IntPtr hwnd)
    {
        var len = GetWindowTextLength(hwnd);
        if (len <= 0) return "";
        var sb = new StringBuilder(len + 1);
        GetWindowText(hwnd, sb, sb.Capacity);
        return sb.ToString();
    }

    public void Dispose()
    {
        _disposed = true;
        try { _tick.Stop(); _tick.Dispose(); } catch { }
        if (_hook != IntPtr.Zero) { try { UnhookWinEvent(_hook); } catch { } _hook = IntPtr.Zero; }
    }

    // ---------- Win32 ----------
    private const uint EVENT_SYSTEM_FOREGROUND = 0x0003;
    private const uint WINEVENT_OUTOFCONTEXT = 0x0000;
    private const int OBJID_WINDOW = 0;

    private delegate void WinEventDelegate(IntPtr hWinEventHook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint dwEventThread, uint dwmsEventTime);

    [DllImport("user32.dll")] private static extern IntPtr SetWinEventHook(uint eventMin, uint eventMax, IntPtr hmodWinEventProc, WinEventDelegate lpfnWinEventProc, uint idProcess, uint idThread, uint dwFlags);
    [DllImport("user32.dll")] private static extern bool UnhookWinEvent(IntPtr hWinEventHook);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] private static extern int GetWindowTextLength(IntPtr hWnd);
}
