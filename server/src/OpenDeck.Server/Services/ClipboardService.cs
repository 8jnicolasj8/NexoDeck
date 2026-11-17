using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace OpenDeck.Server.Services;

internal sealed record ClipboardItem(string Text, long Ts);

internal sealed class ClipboardService : IDisposable
{
    public event Action<string, long>? ClipboardChanged;

    private readonly List<ClipboardItem> _history = [];
    private readonly object _lock = new();
    private string _lastText = "";
    private ClipboardListenerWindow? _listenerWindow;
    private Thread? _messageLoopThread;
    private readonly ManualResetEvent _ready = new(false);

    public ClipboardService()
    {
        StartMessageLoop();
    }

    private void StartMessageLoop()
    {
        _messageLoopThread = new Thread(() =>
        {
            try
            {
                _listenerWindow = new ClipboardListenerWindow(OnClipboardUpdate);
                _ready.Set();
                System.Windows.Forms.Application.Run();
            }
            catch { _ready.Set(); }
        })
        {
            IsBackground = true
        };
        _messageLoopThread.SetApartmentState(ApartmentState.STA);
        _messageLoopThread.Start();
        _ready.WaitOne(2000);
    }

    private void OnClipboardUpdate()
    {
        try
        {
            string? text = null;
            RunSta(() =>
            {
                if (System.Windows.Forms.Clipboard.ContainsText())
                {
                    text = System.Windows.Forms.Clipboard.GetText();
                }
            });

            if (string.IsNullOrEmpty(text)) return;

            // Blueprint: max 10 KB per entry
            const int maxBytes = 10 * 1024;
            if (text.Length > maxBytes)
            {
                text = text[..maxBytes];
            }

            lock (_lock)
            {
                if (text == _lastText) return;
                _lastText = text;

                var ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                _history.Insert(0, new ClipboardItem(text, ts));
                if (_history.Count > 10)
                {
                    _history.RemoveAt(_history.Count - 1);
                }

                ClipboardChanged?.Invoke(text, ts);
            }
        }
        catch { }
    }

    public void SetText(string text) => TrySetText(text, suppressHistory: false);

    /// <summary>Writes Unicode text with retries. When suppressed, the change is not added to the history.</summary>
    public bool TrySetText(string text, bool suppressHistory)
    {
        if (text is null) return false;

        const int maxBytes = 10 * 1024;
        if (text.Length > maxBytes) text = text[..maxBytes];

        if (suppressHistory)
        {
            lock (_lock)
            {
                _lastText = text;
            }
        }

        var written = RunSta(() =>
        {
            for (var attempt = 0; attempt < 5; attempt++)
            {
                try
                {
                    System.Windows.Forms.Clipboard.Clear();
                    System.Windows.Forms.Clipboard.SetText(text);
                    return true;
                }
                catch (Exception)
                {
                    Thread.Sleep(20);
                }
            }
            return false;
        });

        if (!written) return false;

        if (!suppressHistory)
        {
            lock (_lock)
            {
                _lastText = text;
                var ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                if (_history.Count == 0 || _history[0].Text != text)
                {
                    _history.Insert(0, new ClipboardItem(text, ts));
                    if (_history.Count > 10) _history.RemoveAt(_history.Count - 1);
                }
            }
        }

        return true;
    }

    /// <summary>Reads text from the clipboard. Returns false when the clipboard has no text.</summary>
    public bool TryGetText(out string? text)
    {
        var value = RunSta(() =>
        {
            for (var attempt = 0; attempt < 5; attempt++)
            {
                try
                {
                    if (!System.Windows.Forms.Clipboard.ContainsText()) return null;
                    return System.Windows.Forms.Clipboard.GetText();
                }
                catch (Exception)
                {
                    Thread.Sleep(20);
                }
            }
            return null;
        });

        text = value;
        return !string.IsNullOrEmpty(value);
    }

    public IReadOnlyList<ClipboardItem> GetHistory()
    {
        lock (_lock)
        {
            return _history.ToList();
        }
    }

    private static void RunSta(Action action) => RunSta(() => { action(); return true; });

    private static T RunSta<T>(Func<T> action, T fallback = default!)
    {
        T result = fallback;
        var thread = new Thread(() =>
        {
            try { result = action(); } catch { }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.IsBackground = true;
        thread.Start();
        thread.Join(1500);
        return result;
    }

    public void Dispose()
    {
        try
        {
            if (_listenerWindow is not null)
            {
                _listenerWindow.Dispose();
                _listenerWindow = null;
            }
            if (_messageLoopThread is not null && _messageLoopThread.IsAlive)
            {
                System.Windows.Forms.Application.ExitThread();
            }
        }
        catch { }
        _ready.Dispose();
    }

    private sealed class ClipboardListenerWindow : NativeWindow, IDisposable
    {
        private const int WM_CLIPBOARDUPDATE = 0x031D;
        private readonly Action _onUpdate;

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool AddClipboardFormatListener(IntPtr hwnd);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool RemoveClipboardFormatListener(IntPtr hwnd);

        public ClipboardListenerWindow(Action onUpdate)
        {
            _onUpdate = onUpdate;
            CreateHandle(new CreateParams());
            AddClipboardFormatListener(Handle);
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_CLIPBOARDUPDATE)
            {
                _onUpdate();
            }
            base.WndProc(ref m);
        }

        public void Dispose()
        {
            if (Handle != IntPtr.Zero)
            {
                RemoveClipboardFormatListener(Handle);
                DestroyHandle();
            }
        }
    }
}
