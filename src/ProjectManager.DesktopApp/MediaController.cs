using System.Text.Json;
using Windows.Media.Control;
using Windows.Storage.Streams;

namespace ProjectManager.DesktopApp;

// Windows 시스템 미디어(SMTC) 현재 세션을 읽고 제어. 위젯 Now Playing 카드용.
// 어떤 앱이든 SMTC 와 연동되면(Spotify/브라우저/플레이어 등) 표시·제어 가능.
// 상태 변화(곡·재생상태·타임라인)를 구독해 위젯 WebView2 로 push(_push 콜백은 UI 스레드 마샬링 책임).
using SmtcManager = Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager;
using SmtcSession = Windows.Media.Control.GlobalSystemMediaTransportControlsSession;

internal sealed class MediaController : IDisposable
{
    private readonly Action<string> _push;
    private SmtcManager? _manager;
    private SmtcSession? _session;
    private double _timelineStart;
    private bool _disposed;

    public MediaController(Action<string> push) => _push = push;

    public async Task InitAsync()
    {
        try
        {
            _manager = await SmtcManager.RequestAsync();
            _manager.CurrentSessionChanged += OnCurrentSessionChanged;
            HookSession(_manager.GetCurrentSession());
            await PushStateAsync();
        }
        catch (System.Exception ex)
        {
            DesktopLog.Write($"[media-init-err] {ex.GetType().Name}: {ex.Message}");
        }
    }

    private void OnCurrentSessionChanged(SmtcManager sender, CurrentSessionChangedEventArgs args)
    {
        HookSession(sender.GetCurrentSession());
        _ = PushStateAsync();
    }

    private void HookSession(SmtcSession? session)
    {
        if (_session is not null)
        {
            try
            {
                _session.MediaPropertiesChanged -= OnChanged;
                _session.PlaybackInfoChanged -= OnChanged;
                _session.TimelinePropertiesChanged -= OnChanged;
            }
            catch { }
        }
        _session = session;
        if (_session is not null)
        {
            _session.MediaPropertiesChanged += OnChanged;
            _session.PlaybackInfoChanged += OnChanged;
            _session.TimelinePropertiesChanged += OnChanged;
        }
    }

    private void OnChanged(SmtcSession sender, object args) => _ = PushStateAsync();

    // 위젯이 마운트되며 현재 상태를 요청할 때(초기 구독 누락 방지).
    public Task RequestAsync() => PushStateAsync();

    public async Task ControlAsync(string? action)
    {
        var s = _session;
        if (s is null) return;
        try
        {
            switch (action)
            {
                case "play": await s.TryPlayAsync(); break;
                case "pause": await s.TryPauseAsync(); break;
                case "playpause":
                    if (s.GetPlaybackInfo().PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing)
                        await s.TryPauseAsync();
                    else await s.TryPlayAsync();
                    break;
                case "next": await s.TrySkipNextAsync(); break;
                case "prev": await s.TrySkipPreviousAsync(); break;
            }
        }
        catch (System.Exception ex) { DesktopLog.Write($"[media-ctrl-err] {ex.Message}"); }
    }

    // seconds 는 타임라인 시작 기준 상대 위치(0~duration).
    public async Task SeekAsync(double seconds)
    {
        var s = _session;
        if (s is null) return;
        try
        {
            var ticks = (long)TimeSpan.FromSeconds(_timelineStart + Math.Max(0, seconds)).Ticks;
            await s.TryChangePlaybackPositionAsync(ticks);
        }
        catch (System.Exception ex) { DesktopLog.Write($"[media-seek-err] {ex.Message}"); }
    }

    private async Task PushStateAsync()
    {
        if (_disposed) return;
        var s = _session;
        if (s is null)
        {
            _push(JsonSerializer.Serialize(new { type = "mediaUpdate", hasSession = false }));
            return;
        }
        try
        {
            var props = await s.TryGetMediaPropertiesAsync();
            var info = s.GetPlaybackInfo();
            var tl = s.GetTimelineProperties();

            _timelineStart = tl.StartTime.TotalSeconds;
            double duration = tl.EndTime.TotalSeconds - _timelineStart;
            double position = tl.Position.TotalSeconds - _timelineStart;
            bool hasTimeline = duration > 0.5;

            var status = info.PlaybackStatus;
            var ctrl = info.Controls;
            var thumbnail = await ReadThumbnailAsync(props);

            _push(JsonSerializer.Serialize(new
            {
                type = "mediaUpdate",
                hasSession = true,
                title = props.Title ?? "",
                artist = props.Artist ?? "",
                thumbnail,
                playing = status == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing,
                canPlay = ctrl.IsPlayEnabled,
                canPause = ctrl.IsPauseEnabled,
                canNext = ctrl.IsNextEnabled,
                canPrev = ctrl.IsPreviousEnabled,
                hasTimeline,
                position = Math.Max(0, position),
                duration = Math.Max(0, duration),
            }));
        }
        catch (System.Exception ex)
        {
            DesktopLog.Write($"[media-state-err] {ex.GetType().Name}: {ex.Message}");
        }
    }

    private static async Task<string?> ReadThumbnailAsync(GlobalSystemMediaTransportControlsSessionMediaProperties props)
    {
        try
        {
            var thumbRef = props.Thumbnail;
            if (thumbRef is null) return null;
            using var stream = await thumbRef.OpenReadAsync();
            if (stream is null || stream.Size == 0 || stream.Size > 4_000_000) return null;
            var size = (uint)stream.Size;
            var reader = new DataReader(stream.GetInputStreamAt(0));
            await reader.LoadAsync(size);
            var bytes = new byte[size];
            reader.ReadBytes(bytes);
            var ct = string.IsNullOrEmpty(stream.ContentType) ? "image/png" : stream.ContentType;
            return $"data:{ct};base64,{Convert.ToBase64String(bytes)}";
        }
        catch { return null; }
    }

    public void Dispose()
    {
        _disposed = true;
        try
        {
            HookSession(null);
            if (_manager is not null) _manager.CurrentSessionChanged -= OnCurrentSessionChanged;
        }
        catch { }
    }
}
