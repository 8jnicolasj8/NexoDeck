using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace NexoDeck.Server.Services;

internal sealed class ForegroundWatcher : IDisposable
{
    public event Action<string, string>? ForegroundChanged;

    private delegate void WinEventDelegate(IntPtr hWinEventHook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint dwEventThread, uint dwmsEventTime);

    private const uint EVENT_SYSTEM_FOREGROUND = 0x0003;
    private const uint WINEVENT_OUTOFCONTEXT = 0x0000;
    private const uint WINEVENT_SKIPOWNPROCESS = 0x0002;

    private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

    [DllImport("user32.dll")]
    private static extern IntPtr SetWinEventHook(uint eventMin, uint eventMax, IntPtr hmodWinEventProc, WinEventDelegate lpfnWinEventProc, uint idProcess, uint idThread, uint dwFlags);

    [DllImport("user32.dll")]
    private static extern bool UnhookWinEvent(IntPtr hWinEventHook);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint processAccess, bool bInheritHandle, uint processId);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool QueryFullProcessImageName(IntPtr hProcess, int dwFlags, [Out] StringBuilder lpExeName, ref int lpdwSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    private readonly WinEventDelegate _hookProc;
    private readonly IntPtr _hook;
    private readonly System.Threading.Timer _debounceTimer;
    private string _lastProcessName = "";
    private string _pendingProcessName = "";
    private string _pendingFullPath = "";
    private readonly object _lock = new();

    public ForegroundWatcher()
    {
        _hookProc = OnWinEvent;
        _debounceTimer = new System.Threading.Timer(OnDebounceElapsed, null, Timeout.Infinite, Timeout.Infinite);

        _hook = SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            IntPtr.Zero,
            _hookProc,
            0,
            0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS
        );

        // Check initial active window
        CheckForegroundWindow();
    }

    private void OnWinEvent(IntPtr hWinEventHook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint dwEventThread, uint dwmsEventTime)
    {
        if (eventType == EVENT_SYSTEM_FOREGROUND)
        {
            CheckForegroundWindow();
        }
    }

    public void CheckForegroundWindow()
    {
        var hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero) return;

        GetWindowThreadProcessId(hwnd, out var pid);
        if (pid == 0) return;

        var fullPath = GetProcessImagePath(pid);
        var processName = Path.GetFileName(fullPath).ToLowerInvariant();

        // UWP special handling: ApplicationFrameHost.exe hosts child UWP windows
        if (processName == "applicationframehost.exe")
        {
            var uwpPid = ResolveUwpChildProcess(hwnd);
            if (uwpPid != 0 && uwpPid != pid)
            {
                var realPath = GetProcessImagePath(uwpPid);
                if (!string.IsNullOrEmpty(realPath))
                {
                    fullPath = realPath;
                    processName = Path.GetFileName(realPath).ToLowerInvariant();
                }
            }
        }

        if (string.IsNullOrEmpty(processName)) return;

        lock (_lock)
        {
            _pendingProcessName = processName;
            _pendingFullPath = fullPath;
            // 150 ms debounce
            _debounceTimer.Change(150, Timeout.Infinite);
        }
    }

    private void OnDebounceElapsed(object? state)
    {
        string process;
        string path;
        lock (_lock)
        {
            process = _pendingProcessName;
            path = _pendingFullPath;
            if (string.IsNullOrEmpty(process) || process == _lastProcessName) return;
            _lastProcessName = process;
        }

        ForegroundChanged?.Invoke(process, path);
    }

    private static uint ResolveUwpChildProcess(IntPtr parentHwnd)
    {
        uint childPid = 0;
        EnumChildWindows(parentHwnd, (childHwnd, lParam) =>
        {
            GetWindowThreadProcessId(childHwnd, out var pid);
            if (pid != 0)
            {
                var name = Path.GetFileName(GetProcessImagePath(pid)).ToLowerInvariant();
                if (name != "applicationframehost.exe" && !string.IsNullOrEmpty(name))
                {
                    childPid = pid;
                    return false; // Stop enumeration
                }
            }
            return true;
        }, IntPtr.Zero);

        return childPid;
    }

    private static string GetProcessImagePath(uint pid)
    {
        var handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if (handle == IntPtr.Zero)
        {
            try
            {
                using var p = Process.GetProcessById((int)pid);
                return p.MainModule?.FileName ?? p.ProcessName + ".exe";
            }
            catch
            {
                return "";
            }
        }

        try
        {
            var sb = new StringBuilder(1024);
            var size = sb.Capacity;
            if (QueryFullProcessImageName(handle, 0, sb, ref size))
            {
                return sb.ToString();
            }
            return "";
        }
        finally
        {
            CloseHandle(handle);
        }
    }

    public void Dispose()
    {
        _debounceTimer.Dispose();
        if (_hook != IntPtr.Zero)
        {
            UnhookWinEvent(_hook);
        }
    }
}
