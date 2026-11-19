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

    /// <summary>Schedules the shutdown. Returns null on success, or a message for the client.</summary>
    public string? Shutdown(bool confirmed, int delaySec = 5) => Schedule("/s", "apagar", confirmed, delaySec);

    /// <summary>Schedules the restart. Returns null on success, or a message for the client.</summary>
    public string? Restart(bool confirmed, int delaySec = 5) => Schedule("/r", "reiniciar", confirmed, delaySec);

    public bool CancelShutdown()
    {
        return RunShutdown("/a", out _) is null;
    }

    private static string? Schedule(string flag, string verb, bool confirmed, int delaySec)
    {
        if (!confirmed) return $"Confirmá la acción de {verb} desde el celular.";

        var args = $"{flag} /t {delaySec} /c \"NexoDeck: {verb[..1].ToUpperInvariant()}{verb[1..]}ndo en {delaySec} segundos...\"";
        var error = RunShutdown(args, out var exitCode);

        // Some antivirus/AppLocker policies block shutdown.exe when it is spawned
        // directly. Retry through the shell, which usually gets through.
        if (error is not null)
        {
            AppLog.Warn($"shutdown.exe {flag} falló ({error}); se reintenta vía shell.");
            error = RunShutdown(args, out exitCode, useShell: true);
        }

        if (error is not null)
        {
            AppLog.Warn($"No se pudo {verb} la PC: {error}");
            return $"Windows no dejó {verb} la PC ({error}).";
        }

        AppLog.Info($"Acción de energía aceptada: {verb} en {delaySec} s.");
        return null;
    }

    private static string? RunShutdown(string arguments, out int exitCode, bool useShell = false)
    {
        exitCode = 0;
        var executable = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "shutdown.exe");
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = File.Exists(executable) ? executable : "shutdown.exe",
                Arguments = arguments,
                UseShellExecute = useShell,
                CreateNoWindow = !useShell,
                RedirectStandardError = !useShell,
                RedirectStandardOutput = !useShell
            };

            using var process = Process.Start(psi);
            if (process is null) return "no se pudo iniciar shutdown.exe";

            string stderr = "";
            if (!useShell)
            {
                stderr = process.StandardError.ReadToEnd().Trim();
                if (!process.WaitForExit(4000))
                {
                    // The countdown is running in the system, which is what we want.
                    return null;
                }
            }

            exitCode = process.ExitCode;
            if (exitCode == 0) return null;

            if (string.IsNullOrWhiteSpace(stderr)) stderr = $"código {exitCode}";
            return stderr;
        }
        catch (Exception ex)
        {
            return ex.Message;
        }
    }
}
