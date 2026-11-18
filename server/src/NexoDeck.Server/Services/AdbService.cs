using System.Diagnostics;
using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;

namespace NexoDeck.Server.Services;

internal sealed record AdbDevice(string Serial, string State, string Model, bool Approved, bool HasReverse);

internal sealed record AdbState(
    bool Found,
    string? Path,
    string? Version,
    bool Enabled,
    bool Running,
    List<AdbDevice> Devices,
    string? ApkPath,
    string? LastError);

/// <summary>
/// Optional USB support: makes <c>127.0.0.1:47801</c> on the phone reach this PC
/// through the cable with <c>adb reverse</c>. Everything is opt-in and ADB is
/// never redistributed: it is only downloaded when the user asks for it.
/// </summary>
internal sealed class AdbService(ConfigService config, string dataDir)
{
    private const string PlatformToolsUrl = "https://dl.google.com/android/repository/platform-tools-latest-windows.zip";

    private readonly object _sync = new();
    private string? _adbPath;
    private bool _serverStartedByUs;
    private string? _lastError;
    private bool _downloading;

    public string? LastError => _lastError;
    public bool Downloading => _downloading;

    public string Locate()
    {
        if (_adbPath is not null && File.Exists(_adbPath)) return _adbPath;

        var candidates = new List<string>();
        var configured = config.Read().Host.AdbPath;
        if (!string.IsNullOrWhiteSpace(configured)) candidates.Add(configured!);
        candidates.Add(Path.Combine(dataDir, "tools", "platform-tools", "adb.exe"));

        var androidHome = Environment.GetEnvironmentVariable("ANDROID_HOME")
                          ?? Environment.GetEnvironmentVariable("ANDROID_SDK_ROOT");
        if (!string.IsNullOrWhiteSpace(androidHome))
            candidates.Add(Path.Combine(androidHome!, "platform-tools", "adb.exe"));

        var pathVar = Environment.GetEnvironmentVariable("PATH") ?? "";
        candidates.AddRange(pathVar
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
            .Select(dir => Path.Combine(dir.Trim(), "adb.exe")));

        _adbPath = candidates.FirstOrDefault(File.Exists);
        return _adbPath ?? "";
    }

    public string? FindApk()
    {
        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "mobile", "NexoDeck-Android.apk"),
            Path.Combine(dataDir, "mobile", "NexoDeck-Android.apk")
        };
        return candidates.FirstOrDefault(File.Exists);
    }

    public async Task<AdbState> GetStateAsync()
    {
        var host = config.Read().Host;
        var adb = Locate();
        if (adb.Length == 0)
        {
            return new AdbState(false, null, null, host.UsbEnabled, false, [], FindApk(),
                "No se encontró adb.exe. Elegí una copia existente o descargalo desde el panel.");
        }

        var version = (await RunAsync(adb, ["version"]))?.Split('\n').FirstOrDefault()?.Trim();

        List<AdbDevice> devices = [];
        try
        {
            var output = await RunAsync(adb, ["devices", "-l"]) ?? "";
            foreach (var line in output.Split('\n').Skip(1))
            {
                var trimmed = line.Trim();
                if (trimmed.Length == 0) continue;
                var parts = Regex.Split(trimmed, "\\s+");
                if (parts.Length < 2) continue;
                var serial = parts[0];
                var state = parts[1];
                var modelMatch = Regex.Match(trimmed, "model:([^\\s]+)");
                var model = modelMatch.Success ? modelMatch.Groups[1].Value.Replace('_', ' ') : serial;
                var approved = host.ApprovedUsbSerials.Contains(serial);
                var reverse = false;
                if (state == "device" && approved)
                {
                    var list = await RunAsync(adb, ["-s", serial, "reverse", "--list"]) ?? "";
                    reverse = list.Contains("tcp:47801");
                }
                devices.Add(new AdbDevice(serial, state, model, approved, reverse));
            }
        }
        catch (Exception ex)
        {
            _lastError = ex.Message;
        }

        return new AdbState(true, adb, version, host.UsbEnabled, _serverStartedByUs, devices, FindApk(), _lastError);
    }

    public async Task<AdbState> EnsureReverseAsync()
    {
        var host = config.Read().Host;
        var adb = Locate();
        if (adb.Length == 0 || !host.UsbEnabled) return await GetStateAsync();

        await EnsureServerAsync(adb);
        foreach (var serial in host.ApprovedUsbSerials)
        {
            var reply = await RunAsync(adb, ["-s", serial, "reverse", "tcp:47801", "tcp:47801"]);
            if (reply is null) continue;
        }
        return await GetStateAsync();
    }

    public async Task<(bool Ok, string? Message)> ReverseAsync(string serial)
    {
        var adb = Locate();
        if (adb.Length == 0) return (false, "No se encontró adb.exe.");
        await EnsureServerAsync(adb);
        var reply = await RunAsync(adb, ["-s", serial, "reverse", "tcp:47801", "tcp:47801"]);
        return reply is null ? (false, "No se pudo crear el túnel USB.") : (true, reply.Trim());
    }

    public async Task<(bool Ok, string? Message)> InstallAsync(string serial)
    {
        var adb = Locate();
        var apk = FindApk();
        if (adb.Length == 0) return (false, "No se encontró adb.exe.");
        if (apk is null) return (false, "No hay APK disponible. Publicá un release o copiá NexoDeck-Android.apk en la carpeta mobile del programa.");
        var reply = await RunAsync(adb, ["-s", serial, "install", "-r", apk], TimeSpan.FromMinutes(3));
        return reply is null ? (false, "La instalación falló.") : (!reply.Contains("Failure", StringComparison.OrdinalIgnoreCase), reply.Trim());
    }

    public async Task<(bool Ok, string? Message)> OpenPairLinkAsync(string serial, string link)
    {
        var adb = Locate();
        if (adb.Length == 0) return (false, "No se encontró adb.exe.");
        var reply = await RunAsync(adb, ["-s", serial, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", $"'{link}'"]);
        return reply is null ? (false, "No se pudo abrir el enlace en el celular.") : (true, reply.Trim());
    }

    public void SetAdbPath(string path)
    {
        _adbPath = File.Exists(path) ? path : null;
        var host = config.Read().Host;
        config.SaveHost(host with { AdbPath = path });
    }

    public void SetEnabled(bool enabled)
    {
        var host = config.Read().Host;
        config.SaveHost(host with { UsbEnabled = enabled });
        if (!enabled)
        {
            var adb = Locate();
            if (adb.Length > 0 && _serverStartedByUs)
            {
                _ = RunAsync(adb, ["kill-server"]);
                _serverStartedByUs = false;
            }
        }
    }

    public void SetApproved(string serial, bool approved)
    {
        var host = config.Read().Host;
        var serials = host.ApprovedUsbSerials.Where(item => item != serial).ToList();
        if (approved) serials.Add(serial);
        config.SaveHost(host with { ApprovedUsbSerials = serials });
    }

    public async Task DownloadAdbAsync()
    {
        if (_downloading) return;
        _downloading = true;
        try
        {
            var toolsDir = Path.Combine(dataDir, "tools");
            Directory.CreateDirectory(toolsDir);
            var zipPath = Path.Combine(toolsDir, "platform-tools.zip");
            using var client = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
            await using (var source = await client.GetStreamAsync(PlatformToolsUrl))
            await using (var target = File.Create(zipPath))
            {
                await source.CopyToAsync(target);
            }
            ZipFile.ExtractToDirectory(zipPath, toolsDir, true);
            File.Delete(zipPath);

            var adb = Path.Combine(toolsDir, "platform-tools", "adb.exe");
            if (!File.Exists(adb)) throw new InvalidOperationException("El archivo descargado no contiene adb.exe.");
            _adbPath = adb;
            var host = config.Read().Host;
            config.SaveHost(host with { AdbPath = adb });
        }
        catch (Exception ex)
        {
            _lastError = ex.Message;
            AppLog.Warn($"No se pudo descargar ADB: {ex.Message}");
        }
        finally { _downloading = false; }
    }

    public void Shutdown()
    {
        var adb = Locate();
        if (adb.Length > 0 && _serverStartedByUs) _ = RunAsync(adb, ["kill-server"]);
    }

    private async Task EnsureServerAsync(string adb)
    {
        if (_serverStartedByUs) return;
        // If the ADB server was already running (Android Studio, another tool),
        // NexoDeck must leave it alone on exit.
        var alreadyRunning = IsAdbServerRunning();
        var probe = await RunAsync(adb, ["start-server"]);
        if (probe is null) return;
        _serverStartedByUs = !alreadyRunning;
    }

    private static bool IsAdbServerRunning()
    {
        try
        {
            using var client = new System.Net.Sockets.TcpClient();
            return client.ConnectAsync("127.0.0.1", 5037).Wait(200);
        }
        catch { return false; }
    }

    private static async Task<string?> RunAsync(string executable, IEnumerable<string> arguments, TimeSpan? timeout = null)
    {
        try
        {
            var start = new ProcessStartInfo
            {
                FileName = executable,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            foreach (var argument in arguments) start.ArgumentList.Add(argument);

            using var process = Process.Start(start);
            if (process is null) return null;
            var output = new StringBuilder();
            process.OutputDataReceived += (_, e) => { if (e.Data is not null) output.AppendLine(e.Data); };
            process.ErrorDataReceived += (_, e) => { if (e.Data is not null) output.AppendLine(e.Data); };
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            using var cts = new CancellationTokenSource(timeout ?? TimeSpan.FromSeconds(20));
            try { await process.WaitForExitAsync(cts.Token); }
            catch (OperationCanceledException)
            {
                try { process.Kill(true); } catch { }
                return null;
            }
            // Flush the asynchronous readers before reading the buffer.
            process.WaitForExit();
            return output.ToString();
        }
        catch (Exception ex)
        {
            AppLog.Warn($"adb: {ex.Message}");
            return null;
        }
    }
}
