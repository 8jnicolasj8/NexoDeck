using System.Diagnostics;
using System.Runtime.InteropServices;

namespace NexoDeck.Server.Services;

internal sealed class PowerService
{
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool LockWorkStation();

    [DllImport("Powrprof.dll", SetLastError = true)]
    private static extern bool SetSuspendState(bool hibernate, bool forceCritical, bool disableWakeEvent);

    public bool Lock()
    {
        return LockWorkStation();
    }

    public bool Sleep()
    {
        return SetSuspendState(false, true, false);
    }

    public bool Shutdown(bool confirmed, int delaySec = 5)
    {
        if (!confirmed) return false;
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "shutdown.exe",
                Arguments = $"/s /t {delaySec} /c \"NexoDeck: Apagando en {delaySec} segundos...\"",
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var proc = Process.Start(psi);
            return proc is not null;
        }
        catch { return false; }
    }

    public bool Restart(bool confirmed, int delaySec = 5)
    {
        if (!confirmed) return false;
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "shutdown.exe",
                Arguments = $"/r /t {delaySec} /c \"NexoDeck: Reiniciando en {delaySec} segundos...\"",
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var proc = Process.Start(psi);
            return proc is not null;
        }
        catch { return false; }
    }

    public bool CancelShutdown()
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "shutdown.exe",
                Arguments = "/a",
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var proc = Process.Start(psi);
            return proc is not null;
        }
        catch { return false; }
    }
}
