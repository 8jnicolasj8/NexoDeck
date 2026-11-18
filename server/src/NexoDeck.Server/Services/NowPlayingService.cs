using Windows.Media.Control;

namespace NexoDeck.Server.Services;

internal sealed record NowPlayingState(
    string Title,
    string Artist,
    bool Playing,
    string? ArtUrl,
    string App
);

internal sealed class NowPlayingService : IDisposable
{
    public event Action<NowPlayingState>? NowPlayingChanged;

    private GlobalSystemMediaTransportControlsSessionManager? _manager;
    private GlobalSystemMediaTransportControlsSession? _currentSession;
    private byte[]? _currentThumbnailBytes;
    private long _thumbnailTimestamp;
    private readonly object _lock = new();
    private bool _initialized;

    public NowPlayingState CurrentState { get; private set; } = new("", "", false, null, "");

    public NowPlayingService()
    {
        _ = InitializeAsync();
    }

    private async Task InitializeAsync()
    {
        try
        {
            _manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
            if (_manager is not null)
            {
                _manager.CurrentSessionChanged += OnCurrentSessionChanged;
                UpdateCurrentSession(_manager.GetCurrentSession());
                _initialized = true;
            }
        }
        catch
        {
            // GSMTC might not be available in certain headless environments
        }
    }

    private void OnCurrentSessionChanged(GlobalSystemMediaTransportControlsSessionManager sender, CurrentSessionChangedEventArgs args)
    {
        UpdateCurrentSession(sender.GetCurrentSession());
    }

    private void UpdateCurrentSession(GlobalSystemMediaTransportControlsSession? session)
    {
        lock (_lock)
        {
            if (_currentSession is not null)
            {
                try
                {
                    _currentSession.MediaPropertiesChanged -= OnMediaPropertiesChanged;
                    _currentSession.PlaybackInfoChanged -= OnPlaybackInfoChanged;
                }
                catch { }
            }

            _currentSession = session;

            if (_currentSession is not null)
            {
                try
                {
                    _currentSession.MediaPropertiesChanged += OnMediaPropertiesChanged;
                    _currentSession.PlaybackInfoChanged += OnPlaybackInfoChanged;
                }
                catch { }
            }
        }

        _ = RefreshNowPlayingAsync();
    }

    private void OnMediaPropertiesChanged(GlobalSystemMediaTransportControlsSession sender, MediaPropertiesChangedEventArgs args)
    {
        _ = RefreshNowPlayingAsync();
    }

    private void OnPlaybackInfoChanged(GlobalSystemMediaTransportControlsSession sender, PlaybackInfoChangedEventArgs args)
    {
        _ = RefreshNowPlayingAsync();
    }

    public async Task RefreshNowPlayingAsync()
    {
        try
        {
            GlobalSystemMediaTransportControlsSession? session;
            lock (_lock) { session = _currentSession; }

            if (session is null)
            {
                var empty = new NowPlayingState("", "", false, null, "");
                CurrentState = empty;
                NowPlayingChanged?.Invoke(empty);
                return;
            }

            var props = await session.TryGetMediaPropertiesAsync();
            var info = session.GetPlaybackInfo();

            var title = props?.Title ?? "";
            var artist = props?.Artist ?? "";
            var playing = info?.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
            var app = session.SourceAppUserModelId ?? "";

            byte[]? thumbBytes = null;
            if (props?.Thumbnail is not null)
            {
                try
                {
                    using var stream = await props.Thumbnail.OpenReadAsync();
                    using var ms = new MemoryStream();
                    using var netStream = stream.AsStreamForRead();
                    await netStream.CopyToAsync(ms);
                    thumbBytes = ms.ToArray();
                }
                catch { }
            }

            string? artUrl = null;
            lock (_lock)
            {
                if (thumbBytes is not null && thumbBytes.Length > 0)
                {
                    _currentThumbnailBytes = thumbBytes;
                    _thumbnailTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    artUrl = $"/media/art?ts={_thumbnailTimestamp}";
                }
            }

            var nextState = new NowPlayingState(title, artist, playing, artUrl, app);
            CurrentState = nextState;
            NowPlayingChanged?.Invoke(nextState);
        }
        catch
        {
            // Graceful fallback
        }
    }

    public byte[]? GetCurrentThumbnail()
    {
        lock (_lock)
        {
            return _currentThumbnailBytes;
        }
    }

    public void Dispose()
    {
        lock (_lock)
        {
            if (_manager is not null)
            {
                try { _manager.CurrentSessionChanged -= OnCurrentSessionChanged; } catch { }
            }
            if (_currentSession is not null)
            {
                try
                {
                    _currentSession.MediaPropertiesChanged -= OnMediaPropertiesChanged;
                    _currentSession.PlaybackInfoChanged -= OnPlaybackInfoChanged;
                }
                catch { }
            }
        }
    }
}
