using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using VexaDeck.Server.Services;
using VexaDeck.Server.Tray;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.Server.Kestrel.Https;
using QRCoder;

namespace VexaDeck.Server.Hosting;

internal sealed class LocalServer : IAsyncDisposable, IDisposable
{
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool LockWorkStation();

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    /// <summary>Versión pública del ensamblado; única fuente para el panel y la PWA.</summary>
    internal static string AppVersion =>
        typeof(LocalServer).Assembly.GetName().Version is { } v ? $"{v.Major}.{v.Minor}.{v.Build}" : "0.0.0";

    private sealed class WindowWrapper : IWin32Window
    {
        private readonly IntPtr _hwnd;
        public WindowWrapper(IntPtr hwnd) => _hwnd = hwnd;
        public IntPtr Handle => _hwnd;
    }

    private sealed class ClientSession
    {
        public required string DeviceId { get; init; }
        public required System.Net.WebSockets.WebSocket Socket { get; init; }
        public bool IsPaused { get; set; }
        /// <summary>1 while a telemetry frame is in flight for this client.</summary>
        public int Sending;
        public bool IsV2 { get; init; }
        public SignedChannel? Outbound { get; init; }
        public SignedChannel? Inbound { get; init; }
        /// <summary>Serializes sends so signed counters always leave in order.</summary>
        public SemaphoreSlim SendGate { get; } = new(1, 1);
    }

    private readonly string _dataDir;
    private readonly ActionSchemaService _schemas;
    private readonly ConfigService _config;
    private readonly PairingService _pairing;
    private readonly CertificateService _certificates;
    private readonly TelemetryService _telemetry;
    private readonly InputService _input;
    private readonly MediaService _media;
    private readonly AudioService _audio;
    private readonly IconService _iconService;
    private readonly AppCatalogService _apps;
    private readonly GameDetector _gameDetector;
    private readonly ProfileResolver _profileResolver;
    private readonly ForegroundWatcher _foregroundWatcher;
    private readonly ScriptService _scripts;
    private readonly PowerService _power;
    private readonly ClipboardService _clipboard;
    private readonly NowPlayingService _nowPlaying;
    private readonly HostIdentityService _identity;
    private readonly AdbService _adb;
    private readonly SpotifyAuthService _spotify;
    private readonly ConcurrentDictionary<string, ClientSession> _sessions = new();
    private readonly ConcurrentDictionary<string, (long Window, int Count)> _identRate = new();
    private MdnsAdvertiser? _mdns;
    private readonly CancellationTokenSource _stop = new();
    private WebApplication? _app;
    private Task? _certificateWatcher;
    private Task? _telemetryLoop;

    public LocalServer(string dataDir)
    {
        _dataDir = dataDir;
        _schemas = new ActionSchemaService();
        _config = new ConfigService(dataDir, _schemas);
        _pairing = new PairingService(_config);
        _certificates = new CertificateService(dataDir);
        _telemetry = new TelemetryService();
        _input = new InputService();
        _media = new MediaService();
        _audio = new AudioService();
        _iconService = new IconService(dataDir);
        _apps = new AppCatalogService();
        _gameDetector = new GameDetector();
        _profileResolver = new ProfileResolver(_config, _gameDetector);
        _foregroundWatcher = new ForegroundWatcher();
        _scripts = new ScriptService(dataDir, _config);
        _power = new PowerService();
        _clipboard = new ClipboardService();
        _nowPlaying = new NowPlayingService();
        _identity = new HostIdentityService(_config);
        _identity.Ensure();
        _adb = new AdbService(_config, dataDir);
        _spotify = new SpotifyAuthService(dataDir);

        _audio.StateChanged += (key, value) =>
        {
            var payload = JsonSerializer.SerializeToUtf8Bytes(new
            {
                v = 1,
                t = "state.update",
                d = new { key, value }
            });
            Broadcast(payload);
        };

        _profileResolver.ProfileChanged += (profileId, process, pinned) =>
        {
            AppLog.Info($"Perfil activo: {profileId} ({process}, fijado: {pinned})");
            var payload = JsonSerializer.SerializeToUtf8Bytes(new
            {
                v = 1,
                t = "profile.changed",
                d = new { profileId, process, pinned }
            });
            Broadcast(payload);
        };

        _foregroundWatcher.ForegroundChanged += (procName, fullPath) =>
        {
            _profileResolver.Resolve(procName, fullPath);
            if (!string.IsNullOrEmpty(fullPath))
            {
                _ = Task.Run(() => _iconService.GetOrExtractIcon(fullPath));
            }
        };

        _clipboard.ClipboardChanged += (text, ts) =>
        {
            var payload = JsonSerializer.SerializeToUtf8Bytes(new
            {
                v = 1,
                t = "clipboard.changed",
                d = new { text, ts }
            });
            Broadcast(payload);
        };

        _nowPlaying.NowPlayingChanged += (np) =>
        {
            var payload = JsonSerializer.SerializeToUtf8Bytes(new
            {
                v = 1,
                t = "media.nowplaying",
                d = np
            });
            Broadcast(payload);
        };

        AppLog.Init(dataDir);
        try
        {
            EnsureAutomaticIcons();
        }
        catch (Exception ex)
        {
            // A bad icon must never keep the server from starting.
            AppLog.Warn($"Automatic icon resolution failed: {ex.Message}");
        }
    }

    /// <summary>
    /// Resolves automatic icons (and regenerates stale ones) before the panel opens.
    /// Only automatic/exe-backed icons are touched; manual library picks are preserved.
    /// </summary>
    private void EnsureAutomaticIcons()
    {
        var config = _config.Read();
        var changed = false;
        var profiles = config.Profiles.Select(profile => profile with
        {
            Pages = profile.Pages.Select(page => page with
            {
                Buttons = page.Buttons.Select(button =>
                {
                    var resolved = ResolveIcon(button, out var updated);
                    if (updated) changed = true;
                    return resolved.Icon is null ? resolved with { Icon = new IconConfig("lucide", "circle") } : resolved;
                }).ToList()
            }).ToList()
        }).ToList();

        if (changed)
        {
            _config.Save(config with { Profiles = profiles });
        }
    }

    private ButtonConfig ResolveIcon(ButtonConfig button, out bool updated)
    {
        updated = false;
        if (button.Action is null) return button;

        var kind = button.Action.Kind;
        // Legacy configs may deserialize without an icon object.
        var icon = button.Icon ?? new IconConfig("auto", "auto");
        var path = ParamReader.GetString(button.Action.Params, "path");

        if (kind == "launch" && !string.IsNullOrWhiteSpace(path))
        {
            var needsResolve = icon.Kind is "auto" or "exe" ||
                               (icon.Kind == "image" && icon.Source is not null && _iconService.IconFileMissing(icon.Value));
            if (!needsResolve) return button;

            if (icon.Kind == "exe" && icon.Source == path && !_iconService.IconFileMissing(icon.Value))
            {
                return button;
            }

            var result = _iconService.GetIconUrl(path);
            if (result?.Url is not null)
            {
                updated = true;
                return button with { Icon = new IconConfig("exe", result.Url, path) };
            }

            var fallback = _schemas.SuggestedIcon(kind) ?? "circle";
            updated = true;
            return button with { Icon = new IconConfig("lucide", fallback) };
        }

        if (icon.Kind == "auto")
        {
            updated = true;
            return button with { Icon = new IconConfig("lucide", _schemas.SuggestedIcon(kind) ?? "circle") };
        }

        return button;
    }

    private void Broadcast(byte[] payload)
    {
        string text;
        try { text = Encoding.UTF8.GetString(payload); }
        catch { return; }
        foreach (var session in _sessions.Values) SendSession(session, text);
    }

    /// <summary>v1 sessions receive raw JSON; v2 sessions receive a signed envelope.</summary>
    private static void SendSession(ClientSession session, string json) => _ = SendSessionAsync(session, json, CancellationToken.None);

    private static async Task SendSessionAsync(ClientSession session, string json, CancellationToken token)
    {
        if (session.Socket.State != System.Net.WebSockets.WebSocketState.Open) return;
        await session.SendGate.WaitAsync(token);
        try
        {
            // Wrapping inside the gate keeps envelope counters in wire order.
            var payload = session.Outbound is null ? json : session.Outbound.Wrap(json);
            await session.Socket.SendAsync(Encoding.UTF8.GetBytes(payload), System.Net.WebSockets.WebSocketMessageType.Text, true, token);
        }
        catch { }
        finally { session.SendGate.Release(); }
    }

    public static async Task<HttpResponseMessage?> TryShowExistingWindowAsync()
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromMilliseconds(350) };
        using var health = await client.GetAsync("http://127.0.0.1:47802/api/health");
        if (!health.IsSuccessStatusCode) return null;
        return await client.PostAsync("http://127.0.0.1:47802/api/admin/show-window", null);
    }

    public async Task StartAsync()
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            ContentRootPath = AppContext.BaseDirectory,
            WebRootPath = Path.Combine(AppContext.BaseDirectory, "wwwroot")
        });
        builder.WebHost.ConfigureKestrel(options =>
        {
            options.ListenAnyIP(_config.Read().Server.HttpsPort, listen => listen.UseHttps(https =>
                https.ServerCertificateSelector = (_, _) => _certificates.CurrentServerCertificate));
            options.ListenAnyIP(_config.Read().Server.HttpPort);
            options.ListenLocalhost(47802);
        });
        builder.Logging.ClearProviders();
        builder.Services.AddSingleton(_config);
        _app = builder.Build();
        _app.Use(async (context, next) =>
        {
            var localPort = context.Connection.LocalPort;
            var remote = context.Connection.RemoteIpAddress;
            if (localPort == 47802 && remote is not null && !IPAddress.IsLoopback(remote)) { context.Response.StatusCode = 403; return; }
            if (localPort == 47801 && remote is not null && !IsPrivateOrLoopback(remote)) { context.Response.StatusCode = 403; return; }
            if ((context.Request.Path.StartsWithSegments("/admin") || context.Request.Path.StartsWithSegments("/api/admin")) && localPort != 47802) { context.Response.StatusCode = 403; return; }
            await next();
        });
        _app.UseDefaultFiles();
        _app.UseStaticFiles();
        _app.UseWebSockets();
        var root = Path.Combine(AppContext.BaseDirectory, "wwwroot");
        _app.MapGet("/admin", async context => { context.Response.ContentType = "text/html; charset=utf-8"; await context.Response.SendFileAsync(Path.Combine(root, "admin.html")); });
        _app.MapGet("/setup", async context => { context.Response.ContentType = "text/html; charset=utf-8"; await context.Response.SendFileAsync(Path.Combine(root, "setup.html")); });
        _app.MapGet("/ca.crt", async context =>
        {
            context.Response.ContentType = "application/x-x509-ca-cert";
            context.Response.Headers.ContentDisposition = "attachment; filename=VexaDeck-CA.crt";
            await context.Response.Body.WriteAsync(_certificates.ExportAuthorityCertificate(), context.RequestAborted);
        });
        _app.MapGet("/api/health", () => Results.Json(new
        {
            status = "ok",
            version = AppVersion
        }));

        // Public discovery endpoint: no secrets, only identity and LAN addresses.
        _app.MapGet("/api/ident", (HttpContext context) =>
        {
            if (!AllowIdent(context.Connection.RemoteIpAddress)) return Results.StatusCode(StatusCodes.Status429TooManyRequests);
            context.Response.Headers.CacheControl = "no-store";
            return Results.Json(_identity.Ident());
        });

        _app.MapGet("/api/admin/host", () =>
        {
            var host = _identity.Ensure();
            var adapters = NetworkInfo.GetAdapters();
            return Results.Json(new
            {
                host,
                adapters,
                ident = _identity.Ident(),
                serverId = host.ServerId,
                version = AppVersion
            });
        });
        _app.MapPost("/api/admin/host", async (HttpContext context) =>
        {
            try
            {
                var request = await JsonSerializer.DeserializeAsync<HostUpdateRequest>(context.Request.Body, ConfigService.JsonOptions);
                if (request is null) return Results.BadRequest();
                var host = _identity.Ensure();
                var name = (request.PcName ?? host.PcName ?? Environment.MachineName).Trim();
                if (name.Length == 0) name = Environment.MachineName;
                var color = string.IsNullOrWhiteSpace(request.PcColor) ? host.PcColor : request.PcColor!;
                _config.SaveHost(host with
                {
                    PcName = name[..Math.Min(name.Length, 48)],
                    PcColor = color,
                    PcIcon = string.IsNullOrWhiteSpace(request.PcIcon) ? host.PcIcon : request.PcIcon!,
                    UsbEnabled = request.UsbEnabled ?? host.UsbEnabled,
                    WolEnabled = request.WolEnabled ?? host.WolEnabled,
                    WolPort = request.WolPort is >= 1 and <= 65535 ? request.WolPort!.Value : host.WolPort
                });
                Broadcast(JsonSerializer.SerializeToUtf8Bytes(new
                {
                    v = 1,
                    t = "host.updated",
                    d = new { configRevision = _config.Read().Revision, pcName = name, pcColor = color }
                }, ConfigService.JsonOptions));
                return Results.Json(new { ok = true, host = _identity.Ensure(), ident = _identity.Ident() });
            }
            catch (JsonException) { return Results.BadRequest(); }
        });
        _app.MapPost("/api/admin/host/regenerate", () =>
        {
            _config.RegenerateServerId();
            foreach (var session in _sessions.Values.Where(session => session.IsV2)) session.Socket.Abort();
            return Results.Json(new { ok = true, ident = _identity.Ident() });
        });
        _app.MapGet("/api/admin/wol", () =>
        {
            var host = _identity.Ensure();
            var adapters = NetworkInfo.GetAdapters();
            return Results.Json(new
            {
                enabled = host.WolEnabled,
                port = host.WolPort,
                macs = adapters.Select(a => new { a.Name, a.Description, a.Mac, a.Addresses, a.IsVirtual }).Where(a => a.Mac.Length == 17).ToList(),
                targets = NetworkInfo.GetBroadcastTargets()
            });
        });
        _app.MapPost("/api/admin/wol/test", (WolTestRequest? request) =>
        {
            var host = _identity.Ensure();
            var mac = string.IsNullOrWhiteSpace(request?.Mac) ? NetworkInfo.GetPrimaryMac() : request!.Mac;
            if (string.IsNullOrWhiteSpace(mac)) return Results.Json(new { ok = false, error = "No se encontró una MAC en esta PC." });
            var sent = WakeOnLan.Send(mac, host.WolPort);
            return Results.Json(new { ok = sent, mac, port = host.WolPort, targets = NetworkInfo.GetBroadcastTargets() });
        });
        // --- Spotify (OAuth 2.0 + PKCE, sin Client Secret) ---
        _app.MapGet("/api/admin/spotify", () => Results.Json(_spotify.GetStatus()));
        _app.MapPost("/api/admin/spotify/client-id", async (HttpContext context) =>
        {
            try
            {
                var request = await JsonSerializer.DeserializeAsync<SpotifyClientIdRequest>(context.Request.Body, ConfigService.JsonOptions);
                _spotify.SetClientId(request?.ClientId);
                return Results.Json(_spotify.GetStatus());
            }
            catch (JsonException) { return Results.BadRequest(new { error = "JSON inválido." }); }
            catch (SpotifyException ex) { return Results.BadRequest(new { error = ex.Message }); }
        });
        _app.MapPost("/api/admin/spotify/connect", async (HttpContext context) =>
        {
            try
            {
                var status = await _spotify.LinkAsync(context.RequestAborted);
                return Results.Json(new { ok = true, status });
            }
            catch (SpotifyException ex) { return Results.Json(new { ok = false, error = ex.Message }); }
            catch (HttpRequestException ex) { return Results.Json(new { ok = false, error = $"No se pudo conectar con Spotify: {ex.Message}" }); }
            catch (OperationCanceledException) { return Results.Json(new { ok = false, error = "La vinculación se canceló." }); }
        });
        _app.MapPost("/api/admin/spotify/disconnect", () =>
        {
            _spotify.Unlink();
            return Results.Json(new { ok = true, status = _spotify.GetStatus() });
        });
        _app.MapGet("/api/admin/spotify/now-playing", async (HttpContext context) =>
        {
            try
            {
                var track = await _spotify.GetCurrentlyPlayingAsync(context.RequestAborted);
                return Results.Json(new { ok = true, track });
            }
            catch (SpotifyException ex) { return Results.Json(new { ok = false, error = ex.Message }); }
            catch (HttpRequestException) { return Results.Json(new { ok = false, error = "No se pudo conectar con Spotify." }); }
            catch (OperationCanceledException) { return Results.Json(new { ok = false, error = "Se canceló la consulta." }); }
        });
        _app.MapPost("/api/admin/spotify/command", async (HttpContext context) =>
        {
            try
            {
                var request = await JsonSerializer.DeserializeAsync<SpotifyCommandRequest>(context.Request.Body, ConfigService.JsonOptions);
                var command = (request?.Command ?? "").Trim().ToLowerInvariant();
                var track = await RunSpotifyCommandAsync(command, context.RequestAborted);
                return Results.Json(new { ok = true, track });
            }
            catch (JsonException) { return Results.BadRequest(new { ok = false, error = "JSON inválido." }); }
            catch (SpotifyException ex) { return Results.Json(new { ok = false, error = ex.Message }); }
            catch (HttpRequestException) { return Results.Json(new { ok = false, error = "No se pudo conectar con Spotify." }); }
            catch (OperationCanceledException) { return Results.Json(new { ok = false, error = "Se canceló la acción." }); }
        });

        // --- USB (ADB) ---
        _app.MapGet("/api/admin/usb", async () => Results.Json(await _adb.GetStateAsync()));
        _app.MapPost("/api/admin/usb/enable", async (UsbToggleRequest? request) =>
        {
            _adb.SetEnabled(request?.Enabled ?? false);
            if (request?.Enabled == true) await _adb.EnsureReverseAsync();
            return Results.Json(await _adb.GetStateAsync());
        });
        _app.MapPost("/api/admin/usb/adb-path", (AdbPathRequest? request) =>
        {
            if (string.IsNullOrWhiteSpace(request?.Path) || !File.Exists(request.Path)) return Results.BadRequest(new { error = "Elegí un archivo adb.exe válido." });
            _adb.SetAdbPath(request.Path!);
            return Results.Json(new { ok = true, path = request.Path });
        });
        _app.MapPost("/api/admin/usb/download-adb", () =>
        {
            _ = _adb.DownloadAdbAsync();
            return Results.Json(new { started = true, url = "https://dl.google.com/android/repository/platform-tools-latest-windows.zip" });
        });
        _app.MapPost("/api/admin/usb/approve", async (UsbApproveRequest? request) =>
        {
            if (string.IsNullOrWhiteSpace(request?.Serial)) return Results.BadRequest();
            _adb.SetApproved(request.Serial!, request.Approved);
            if (request.Approved) await _adb.ReverseAsync(request.Serial!);
            return Results.Json(await _adb.GetStateAsync());
        });
        _app.MapPost("/api/admin/usb/reverse", async (SerialRequest? request) =>
        {
            if (string.IsNullOrWhiteSpace(request?.Serial)) return Results.BadRequest();
            return Results.Json(await _adb.ReverseAsync(request.Serial!));
        });
        _app.MapPost("/api/admin/usb/install", async (SerialRequest? request) =>
        {
            if (string.IsNullOrWhiteSpace(request?.Serial)) return Results.BadRequest();
            return Results.Json(await _adb.InstallAsync(request.Serial!));
        });
        _app.MapPost("/api/admin/usb/pair", async (SerialRequest? request) =>
        {
            if (string.IsNullOrWhiteSpace(request?.Serial)) return Results.BadRequest();
            var (secret, expiresAt) = _pairing.CreateAndroidSecret();
            var link = _identity.PairLink(secret, expiresAt, "127.0.0.1");
            return Results.Json(await _adb.OpenPairLinkAsync(request.Serial!, link));
        });

        _app.MapGet("/api/admin/pairing/android", () =>
        {
            var (secret, expiresAt) = _pairing.CreateAndroidSecret();
            var link = _identity.PairLink(secret, expiresAt);
            using var generator = new QRCodeGenerator();
            using var qr = generator.CreateQrCode(link, QRCodeGenerator.ECCLevel.M);
            var png = new PngByteQRCode(qr).GetGraphic(6);
            return Results.Json(new
            {
                link,
                qrDataUrl = $"data:image/png;base64,{Convert.ToBase64String(png)}",
                expiresAt,
                serverId = _identity.ServerId,
                pcName = _identity.PcName
            });
        });
        _app.MapPost("/api/admin/show-window", () => { TrayApplicationContext.Current?.ShowWindow(); return Results.Ok(); });
        _app.MapGet("/api/admin/overview", () => Results.Json(new { config = _config.Read(), ip = GetLanAddress(), ports = new[] { _config.Read().Server.HttpPort, _config.Read().Server.HttpsPort, 47802 }, connectedDevices = _sessions.Count, dataDir = _dataDir, running = true }));
        _app.MapGet("/api/admin/action-schemas", () => Results.Text(_schemas.RawJson, "application/json; charset=utf-8"));
        _app.MapGet("/api/admin/config", () => Results.Json(_config.Read(), ConfigService.JsonOptions));
        _app.MapPost("/api/admin/config", async (HttpContext context) =>
        {
            try
            {
                var updated = await JsonSerializer.DeserializeAsync<AppConfig>(context.Request.Body, ConfigService.JsonOptions);
                if (updated is null) return Results.BadRequest();
                if (updated.Devices == null || updated.Devices.Count == 0)
                {
                    updated = updated with { Devices = _config.Read().Devices };
                }

                var prepared = PrepareConfig(updated);
                if (prepared.Errors.Count > 0)
                {
                    return Results.Json(new { ok = false, errors = prepared.Errors }, statusCode: 400);
                }

                _config.Save(prepared.Config);
                var saved = _config.Read();
                var safeConfig = saved with { Devices = [] };
                var payload = JsonSerializer.SerializeToUtf8Bytes(new
                {
                    v = 1,
                    t = "config.updated",
                    d = new { config = safeConfig, configRevision = saved.Revision }
                }, ConfigService.JsonOptions);
                Broadcast(payload);
                return Results.Json(new { ok = true, warnings = prepared.Warnings, configRevision = saved.Revision });
            }
            catch (Exception ex)
            {
                return Results.Problem(detail: ex.ToString(), statusCode: 500);
            }
        });
        _app.MapGet("/api/admin/telemetry", () => Results.Json(_telemetry.GetMetrics()));
        _app.MapGet("/api/admin/scripts", () =>
        {
            var scriptsDir = _scripts.ScriptsDirectory;
            var list = Directory.GetFiles(scriptsDir, "*.vbs")
                .Select(f => new { id = Path.GetFileNameWithoutExtension(f), name = Path.GetFileName(f), file = Path.GetFileName(f) })
                .ToList();
            return Results.Json(list);
        });
        _app.MapPost("/api/admin/scripts/sample", () =>
        {
            var sampleFile = Path.Combine(_scripts.ScriptsDirectory, "ejemplo_hola.vbs");
            if (!File.Exists(sampleFile))
            {
                File.WriteAllText(sampleFile, "MsgBox \"¡Hola desde VexaDeck!\", 64, \"VexaDeck Script\"");
            }
            return Results.Ok(new { file = "ejemplo_hola.vbs" });
        });
        _app.MapPost("/api/admin/scripts/test", (ScriptTestRequest req) =>
        {
            if (string.IsNullOrWhiteSpace(req.File)) return Results.BadRequest();
            var ok = _scripts.RunFile(req.File);
            return ok ? Results.Ok() : Results.BadRequest();
        });
        _app.MapPost("/api/admin/system/open-folder", (OpenFolderRequest req) =>
        {
            var targetDir = req.Target switch
            {
                "logs" => Path.Combine(_dataDir, "logs"),
                "scripts" => Path.Combine(_dataDir, "scripts"),
                "icons" => Path.Combine(_dataDir, "icons"),
                _ => _dataDir
            };
            Directory.CreateDirectory(targetDir);
            Process.Start(new ProcessStartInfo("explorer.exe", $"\"{targetDir}\"") { UseShellExecute = true });
            return Results.Ok();
        });
        _app.MapPost("/api/admin/pick-file", (PickFileRequest? req) =>
        {
            var kind = req?.Kind?.ToLowerInvariant() ?? "launch";
            var isScript = kind == "script" || kind == "vbs" || kind == "script.run";

            var filter = isScript
                ? "Scripts VBS (*.vbs)|*.vbs|Todos los archivos (*.*)|*.*"
                : "Programas ejecutables (*.exe;*.lnk;*.bat;*.cmd)|*.exe;*.lnk;*.bat;*.cmd|Todos los archivos (*.*)|*.*";

            var title = isScript
                ? "Seleccionar script .vbs"
                : "Seleccionar programa o archivo";

            var initialDir = isScript
                ? _scripts.ScriptsDirectory
                : Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);

            string? selectedPath = null;
            string? pickerError = null;
            var thread = new Thread(() =>
            {
                try
                {
                    using var ofd = new OpenFileDialog
                    {
                        Title = title,
                        Filter = filter,
                        CheckFileExists = true,
                        CheckPathExists = true,
                        Multiselect = false,
                        RestoreDirectory = true,
                        AutoUpgradeEnabled = true,
                        InitialDirectory = Directory.Exists(initialDir) ? initialDir : null
                    };

                    var fg = GetForegroundWindow();
                    IWin32Window? owner = fg != IntPtr.Zero ? new WindowWrapper(fg) : null;
                    if (ofd.ShowDialog(owner) == DialogResult.OK)
                    {
                        selectedPath = ofd.FileName;
                    }
                }
                catch (Exception ex)
                {
                    pickerError = ex.Message;
                }
            });
            thread.SetApartmentState(ApartmentState.STA);
            thread.Start();
            thread.Join();

            if (!string.IsNullOrWhiteSpace(pickerError))
            {
                return Results.Json(new { success = false, error = pickerError });
            }

            if (string.IsNullOrWhiteSpace(selectedPath))
            {
                return Results.Json(new { success = false, cancelled = true });
            }

            var fileName = Path.GetFileName(selectedPath);
            var nameWithoutExt = Path.GetFileNameWithoutExtension(selectedPath);

            if (isScript)
            {
                var targetFile = Path.Combine(_scripts.ScriptsDirectory, fileName);
                if (!string.Equals(Path.GetFullPath(selectedPath), Path.GetFullPath(targetFile), StringComparison.OrdinalIgnoreCase))
                {
                    File.Copy(selectedPath, targetFile, true);
                }

                return Results.Json(new
                {
                    success = true,
                    path = fileName,
                    fileName = fileName,
                    name = nameWithoutExt,
                    fullPath = selectedPath
                });
            }

            return Results.Json(new
            {
                success = true,
                path = selectedPath,
                fileName = fileName,
                name = nameWithoutExt,
                fullPath = selectedPath
            });
        });
        _app.MapGet("/api/admin/config/export", () =>
        {
            var json = JsonSerializer.Serialize(_config.Read(), ConfigService.JsonOptions);
            return Results.Text(json, "application/json");
        });
        _app.MapGet("/api/admin/pairing", () =>
        {
            var code = _pairing.CreateCode();
            var pairingUrl = $"http://{GetLanAddress()}:{_config.Read().Server.HttpPort}/setup?code={Uri.EscapeDataString(code)}";
            using var generator = new QRCodeGenerator();
            using var qr = generator.CreateQrCode(pairingUrl, QRCodeGenerator.ECCLevel.M);
            var png = new PngByteQRCode(qr).GetGraphic(6);
            return Results.Json(new { pairingUrl, code, qrDataUrl = $"data:image/png;base64,{Convert.ToBase64String(png)}", expiresAt = DateTimeOffset.UtcNow.AddMinutes(5) });
        });
        _app.MapGet("/api/admin/devices", () => Results.Json(_config.Read().Devices.Select(device => new
        {
            device.Id,
            device.Name,
            device.CreatedAt,
            device.LastSeen,
            device.Protocol,
            device.Transport,
            connected = _sessions.ContainsKey(device.Id)
        })));
        _app.MapDelete("/api/admin/devices/{id}", (string id) =>
        {
            if (!_config.RevokeDevice(id)) return Results.NotFound();
            if (_sessions.TryRemove(id, out var session)) session.Socket.Abort();
            return Results.Ok();
        });
        _app.MapPost("/api/pair", (HttpContext context, PairRequest request) =>
        {
            if (context.Connection.LocalPort != _config.Read().Server.HttpsPort) return Results.StatusCode(StatusCodes.Status403Forbidden);
            var result = _pairing.Pair(request.Code ?? "", request.DeviceName ?? "");
            return result is null ? Results.BadRequest(new { code = "invalid_pairing_code", message = "El código expiró o ya fue utilizado. Volvé a escanear el QR." }) : Results.Json(result);
        });
        _app.MapGet("/icons/{file}", (string file, HttpContext context) =>
        {
            var path = _iconService.GetIconPathByHash(file);
            if (path is null) return Results.NotFound();
            context.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
            var contentType = Path.GetExtension(path).Equals(".svg", StringComparison.OrdinalIgnoreCase)
                ? "image/svg+xml"
                : "image/png";
            return Results.File(path, contentType);
        });
        _app.MapGet("/api/admin/apps", (string? source) =>
        {
            var result = new List<object>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            if (source is null or "installed" or "all")
            {
                foreach (var app in _apps.GetInstalled())
                {
                    if (!seen.Add($"i:{app.Name}")) continue;
                    result.Add(new { name = app.Name, launch = app.Launch, source = app.Source, aumid = app.Aumid });
                }
            }

            if (source is null or "running" or "all")
            {
                foreach (var process in Process.GetProcesses())
                {
                    try
                    {
                        var path = process.MainModule?.FileName;
                        if (string.IsNullOrWhiteSpace(path)) continue;
                        if (!seen.Add($"r:{path}")) continue;
                        result.Add(new
                        {
                            name = $"{process.ProcessName} — {Path.GetFileName(path)}",
                            launch = path,
                            source = "running",
                            aumid = (string?)null
                        });
                    }
                    catch { }
                    finally { process.Dispose(); }
                }
            }

            return Results.Json(result);
        });
        _app.MapGet("/api/admin/audio-devices", (string? flow) => Results.Json(_audio.GetDevices(flow ?? "output")));
        _app.MapPost("/api/admin/icon", (IconRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.Target)) return Results.BadRequest(new { error = "Falta el archivo o app." });
            var result = _iconService.GetIconUrl(request.Target);
            return result?.Url is null
                ? Results.Json(new { success = false, error = result?.Error ?? "No se pudo extraer el ícono." })
                : Results.Json(new { success = true, icon = result.Url, source = request.Target });
        });
        _app.MapPost("/api/admin/icon/upload", async (HttpContext context) =>
        {
            if (!context.Request.HasFormContentType) return Results.BadRequest(new { error = "Falta el archivo." });
            var form = await context.Request.ReadFormAsync();
            var file = form.Files.FirstOrDefault();
            if (file is null || file.Length == 0) return Results.BadRequest(new { error = "El archivo está vacío." });
            if (file.Length > 2 * 1024 * 1024) return Results.BadRequest(new { error = "La imagen supera 2 MB." });
            await using var stream = file.OpenReadStream();
            var result = _iconService.SaveImage(stream, file.FileName);
            return result.Url is null
                ? Results.Json(new { success = false, error = result.Error })
                : Results.Json(new { success = true, icon = result.Url });
        });
        _app.MapGet("/api/admin/processes", () =>
        {
            var list = Process.GetProcesses()
                .Where(p => !string.IsNullOrEmpty(p.ProcessName))
                .Select(p =>
                {
                    try
                    {
                        var path = "";
                        try { path = p.MainModule?.FileName ?? ""; } catch { }
                        var title = "";
                        try { title = p.MainWindowTitle; } catch { }
                        var iconUrl = !string.IsNullOrEmpty(path) ? _iconService.GetOrExtractIcon(path) : null;
                        return new { id = p.Id, name = p.ProcessName.ToLowerInvariant() + ".exe", title, path, icon = iconUrl };
                    }
                    catch
                    {
                        return new { id = p.Id, name = p.ProcessName.ToLowerInvariant() + ".exe", title = "", path = "", icon = (string?)null };
                    }
                })
                .GroupBy(p => p.name)
                .Select(g => g.First())
                .OrderBy(p => p.name)
                .ToList();
            return Results.Json(list);
        });
        _app.MapGet("/media/art", () =>
        {
            var art = _nowPlaying.GetCurrentThumbnail();
            if (art is null || art.Length == 0) return Results.NotFound();
            return Results.File(art, "image/jpeg");
        });
        _app.Map("/ws", HandleWebSocketAsync);
        _app.Map("/ws2", HandleWebSocketV2Async);
        await _app.StartAsync(_stop.Token);
        _certificateWatcher = _certificates.WatchNetworkChangesAsync(_stop.Token);
        _telemetryLoop = RunTelemetryLoopAsync(_stop.Token);

        var host = _identity.Ensure();
        _mdns = new MdnsAdvertiser(host.PcName ?? Environment.MachineName, host.ServerId, _config.Read().Server.HttpPort, NetworkInfo.GetLanAddresses());
        _mdns.Start();
    }

    private async Task RunTelemetryLoopAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                var interval = Math.Max(250, _config.Read().Server.TelemetryIntervalMs);
                await Task.Delay(interval, token);
                // E3: nobody watching (no phone, no panel request) means no sensor polling either.
                if (_sessions.IsEmpty) continue;

                var metrics = _telemetry.GetMetrics();
                var payload = JsonSerializer.SerializeToUtf8Bytes(new
                {
                    v = 1,
                    t = "telemetry",
                    d = new
                    {
                        ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                        m = metrics
                    }
                });

                var text = Encoding.UTF8.GetString(payload);
                foreach (var session in _sessions.Values)
                {
                    if (session.IsPaused || session.Socket.State != System.Net.WebSockets.WebSocketState.Open) continue;
                    // E4: a slow phone skips late telemetry frames instead of queueing them.
                    if (Interlocked.CompareExchange(ref session.Sending, 1, 0) != 0) continue;
                    try
                    {
                        await SendSessionAsync(session, text, CancellationToken.None);
                    }
                    finally
                    {
                        Interlocked.Exchange(ref session.Sending, 0);
                    }
                }
            }
            catch (OperationCanceledException) { break; }
            catch { }
        }
    }

    private async Task HandleWebSocketAsync(HttpContext context)
    {
        if (!context.WebSockets.IsWebSocketRequest) { context.Response.StatusCode = 400; return; }
        using var socket = await context.WebSockets.AcceptWebSocketAsync();
        var buffer = new byte[64 * 1024];
        string? deviceId = null;
        while (socket.State == System.Net.WebSockets.WebSocketState.Open && !context.RequestAborted.IsCancellationRequested)
        {
            using var message = new MemoryStream();
            System.Net.WebSockets.WebSocketReceiveResult result;
            do
            {
                result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), context.RequestAborted);
                if (result.MessageType == System.Net.WebSockets.WebSocketMessageType.Close) { await socket.CloseAsync(System.Net.WebSockets.WebSocketCloseStatus.NormalClosure, null, CancellationToken.None); return; }
                if (message.Length + result.Count > 64 * 1024) { await socket.CloseAsync(System.Net.WebSockets.WebSocketCloseStatus.MessageTooBig, "Mensaje excede 64 KB", CancellationToken.None); return; }
                message.Write(buffer, 0, result.Count);
            } while (!result.EndOfMessage);
            try
            {
                using var json = JsonDocument.Parse(message.ToArray());
                var kind = json.RootElement.GetProperty("t").GetString();
                var id = json.RootElement.TryGetProperty("id", out var correlation) ? correlation.GetString() : null;
                object? response = null;
                if (kind == "hello")
                {
                    var data = json.RootElement.GetProperty("d");
                    var token = data.TryGetProperty("token", out var tokenValue) ? tokenValue.GetString() : null;
                    var device = token is null ? null : _config.FindDeviceByToken(token);
                    if (device is null)
                    {
                        await socket.SendAsync(new ArraySegment<byte>(JsonSerializer.SerializeToUtf8Bytes(new { v = 1, t = "error", id, d = new { code = "unauthorized", message = "Este dispositivo no está emparejado." } })), System.Net.WebSockets.WebSocketMessageType.Text, true, context.RequestAborted);
                        await socket.CloseAsync(System.Net.WebSockets.WebSocketCloseStatus.PolicyViolation, "Dispositivo no emparejado", CancellationToken.None);
                        return;
                    }
                    deviceId = device.Id;
                    var session = new ClientSession { DeviceId = deviceId, Socket = socket, IsPaused = false };
                    if (_sessions.TryRemove(deviceId, out var previous)) previous.Socket.Abort();
                    _sessions[deviceId] = session;
                    _config.TouchDevice(deviceId);
                    response = new { v = 1, t = "welcome", id, d = BuildWelcomePayload() };
                }
                else if (kind == "ping" && deviceId is not null)
                {
                    response = new { v = 1, t = "pong", id, d = json.RootElement.TryGetProperty("d", out var data) ? data : default };
                }
                else if (kind == "profile.pin" && deviceId is not null)
                {
                    var data = json.RootElement.GetProperty("d");
                    var profileId = data.TryGetProperty("profileId", out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
                    _profileResolver.PinProfile(profileId);
                }
                else if (kind == "profile.select" && deviceId is not null)
                {
                    var data = json.RootElement.GetProperty("d");
                    var profileId = data.TryGetProperty("profileId", out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
                    _profileResolver.SelectProfile(profileId);
                }
                else if (kind == "profile.builtIn" && deviceId is not null)
                {
                    var data = json.RootElement.GetProperty("d");
                    var profileId = data.TryGetProperty("profileId", out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
                    var enabled = data.TryGetProperty("enabled", out var en) && en.ValueKind == JsonValueKind.True;
                    SetBuiltInProfile(profileId, enabled);
                }
                else if (kind == "clipboard.send" && deviceId is not null)
                {
                    var data = json.RootElement.GetProperty("d");
                    var text = data.TryGetProperty("text", out var t) ? t.GetString() : null;
                    var paste = data.TryGetProperty("paste", out var p) && p.GetBoolean();
                    if (!string.IsNullOrEmpty(text))
                    {
                        _clipboard.SetText(text);
                        if (paste)
                        {
                            Thread.Sleep(50);
                            _input.SendHotkey(["ctrl", "v"]);
                        }
                    }
                }
                else if (kind == "clipboard.getHistory" && deviceId is not null)
                {
                    var history = _clipboard.GetHistory();
                    response = new { v = 1, t = "clipboard.history", id, d = new { items = history } };
                }
                else if (kind == "action" && deviceId is not null)
                {
                    var data = json.RootElement.GetProperty("d");
                    var buttonId = data.TryGetProperty("buttonId", out var b) ? b.GetString() ?? "" : "";
                    var val = data.TryGetProperty("value", out var v) ? v : default;
                    var actionError = ExecuteAction(buttonId, val, data);
                    if (actionError is not null)
                    {
                        response = new { v = 1, t = "error", id, d = new { code = "action_failed", message = actionError } };
                    }
                }
                else if (kind == "telemetry.pause" && deviceId is not null)
                {
                    if (_sessions.TryGetValue(deviceId, out var session)) session.IsPaused = true;
                }
                else if (kind == "telemetry.resume" && deviceId is not null)
                {
                    if (_sessions.TryGetValue(deviceId, out var session)) session.IsPaused = false;
                }
                else if (kind == "layout.reorder" && deviceId is not null)
                {
                    var data = json.RootElement.GetProperty("d");
                    var profId = data.TryGetProperty("profileId", out var p) ? p.GetString() : null;
                    var pageId = data.TryGetProperty("pageId", out var pg) ? pg.GetString() : null;
                    if (profId is not null && pageId is not null && data.TryGetProperty("buttons", out var btnsElement))
                    {
                        var cfg = _config.Read();
                        var prof = cfg.Profiles.FirstOrDefault(x => x.Id == profId);
                        if (prof is not null)
                        {
                            var page = prof.Pages.FirstOrDefault(x => x.Id == pageId);
                            if (page is not null)
                            {
                                var newButtons = JsonSerializer.Deserialize<List<ButtonConfig>>(btnsElement.GetRawText(), ConfigService.JsonOptions);
                                if (newButtons is not null)
                                {
                                    var updatedPages = prof.Pages.Select(pgItem => pgItem.Id == pageId ? pgItem with { Buttons = newButtons } : pgItem).ToList();
                                    var updatedProfiles = cfg.Profiles.Select(pItem => pItem.Id == profId ? pItem with { Pages = updatedPages } : pItem).ToList();
                                    var updatedConfig = cfg with { Profiles = updatedProfiles };
                                    _config.Save(updatedConfig);
                                    var savedConfig = _config.Read();
                                    var safeConfig = savedConfig with { Devices = [] };
                                    var payload = JsonSerializer.SerializeToUtf8Bytes(new
                                    {
                                        v = 1,
                                        t = "config.updated",
                                        d = new { config = safeConfig, configRevision = savedConfig.Revision }
                                    }, ConfigService.JsonOptions);
                                    Broadcast(payload);
                                    response = new { v = 1, t = "layout.reordered", id, d = new { ok = true } };
                                }
                            }
                        }
                    }
                }
                else
                {
                    response = new { v = 1, t = "error", id, d = new { code = deviceId is null ? "unauthorized" : "unsupported_message", message = deviceId is null ? "Primero autenticá el dispositivo." : "Mensaje no disponible todavía." } };
                }

                if (response is not null)
                {
                    await socket.SendAsync(new ArraySegment<byte>(JsonSerializer.SerializeToUtf8Bytes(response, ConfigService.JsonOptions)), System.Net.WebSockets.WebSocketMessageType.Text, true, context.RequestAborted);
                }
            }
            catch (JsonException) { }
            catch (KeyNotFoundException) { }
        }
        if (deviceId is not null && _sessions.TryGetValue(deviceId, out var current) && ReferenceEquals(current.Socket, socket))
            _sessions.TryRemove(deviceId, out _);
    }

    private object BuildWelcomePayload()
    {
        var cfg = _config.Read();
        var host = _identity.Ensure();
        return new
        {
            config = cfg with { Devices = [] },
            activeProfileId = _profileResolver.ActiveProfileId,
            pinned = _profileResolver.IsPinned,
            states = _audio.GetInitialStates(),
            clipboard = _clipboard.GetHistory().FirstOrDefault()?.Text,
            nowPlaying = _nowPlaying.CurrentState,
            serverVersion = AppVersion,
            serverId = host.ServerId,
            pcName = host.PcName,
            pcColor = host.PcColor,
            pcIcon = host.PcIcon,
            configRevision = cfg.Revision,
            protocol = new[] { 1, 2 },
            caps = new[] { "signed-v2", "multi-pc", "ident", "resync", "usb-adb", "wake" }
        };
    }

    private async Task HandleWebSocketV2Async(HttpContext context)
    {
        if (!context.WebSockets.IsWebSocketRequest) { context.Response.StatusCode = 400; return; }
        using var socket = await context.WebSockets.AcceptWebSocketAsync();
        ClientSession? session = null;
        try
        {
            using var first = await ReceiveJsonAsync(socket, context.RequestAborted);
            if (first is null) return;
            var type = first.RootElement.TryGetProperty("t", out var tEl) ? tEl.GetString() : null;

            if (type == "pair2")
            {
                if (!await HandlePair2Async(socket, first.RootElement, context.RequestAborted)) return;
                using var hello = await ReceiveJsonAsync(socket, context.RequestAborted);
                if (hello is null) return;
                var helloType = hello.RootElement.TryGetProperty("t", out var ht) ? ht.GetString() : null;
                if (helloType != "hello2") { await CloseAsync(socket, 4400, "hello2 expected"); return; }
                session = await AuthenticateV2Async(socket, hello.RootElement, context.RequestAborted);
            }
            else if (type == "hello2")
            {
                session = await AuthenticateV2Async(socket, first.RootElement, context.RequestAborted);
            }
            else
            {
                await CloseAsync(socket, 4400, "pair2 or hello2 expected");
                return;
            }

            if (session is null) return;

            var welcome = JsonSerializer.Serialize(new { v = 2, t = "welcome", id = (string?)null, d = BuildWelcomePayload() }, ConfigService.JsonOptions);
            await SendSessionAsync(session, welcome, context.RequestAborted);
            _config.UpdateDevice(session.DeviceId, device => device with { LastSeen = DateTimeOffset.UtcNow, Transport = "lan" });
            if (_sessions.TryRemove(session.DeviceId, out var previous)) { try { previous.Socket.Abort(); } catch { } }
            _sessions[session.DeviceId] = session;

            while (socket.State == System.Net.WebSockets.WebSocketState.Open && !context.RequestAborted.IsCancellationRequested)
            {
                using var envelope = await ReceiveJsonAsync(socket, context.RequestAborted);
                if (envelope is null) break;
                if (session.Inbound is null || !session.Inbound.TryUnwrap(envelope.RootElement, out var payload) || payload is null)
                {
                    await CloseAsync(socket, 4401, "invalid signature");
                    break;
                }

                JsonDocument inner;
                try { inner = JsonDocument.Parse(payload); }
                catch (JsonException) { continue; }

                using (inner)
                {
                    var kind = inner.RootElement.TryGetProperty("t", out var k) ? k.GetString() : null;
                    if (kind == "view")
                    {
                        var active = inner.RootElement.TryGetProperty("d", out var viewData) &&
                                     viewData.TryGetProperty("active", out var activeElement) &&
                                     activeElement.ValueKind == JsonValueKind.True;
                        session.IsPaused = !active;
                        continue;
                    }
                    if (kind == "resync")
                    {
                        var resync = JsonSerializer.Serialize(new { v = 2, t = "welcome", id = (string?)null, d = BuildWelcomePayload() }, ConfigService.JsonOptions);
                        await SendSessionAsync(session, resync, context.RequestAborted);
                        continue;
                    }

                    var response = HandleV2Message(session, inner.RootElement);
                    if (response is not null)
                    {
                        await SendSessionAsync(session, JsonSerializer.Serialize(response, ConfigService.JsonOptions), context.RequestAborted);
                    }
                }
            }
        }
        catch (OperationCanceledException) { }
        catch (System.Net.WebSockets.WebSocketException) { }
        catch (Exception ex) { AppLog.Warn($"ws2: {ex.Message}"); }
        finally
        {
            if (session is not null && _sessions.TryGetValue(session.DeviceId, out var current) && ReferenceEquals(current.Socket, socket))
                _sessions.TryRemove(session.DeviceId, out _);
        }
    }

    private async Task<bool> HandlePair2Async(System.Net.WebSockets.WebSocket socket, JsonElement root, CancellationToken token)
    {
        if (!root.TryGetProperty("d", out var data)) { await CloseAsync(socket, 4400, "missing pair2 data"); return false; }
        var deviceId = ReadString(data, "deviceId");
        var deviceName = ReadString(data, "deviceName");
        var nonceC = ReadString(data, "nonceC");
        var proof = ReadString(data, "proof");
        var host = _identity.Ensure();

        if (string.IsNullOrWhiteSpace(deviceId) || string.IsNullOrWhiteSpace(deviceName) ||
            string.IsNullOrWhiteSpace(nonceC) || string.IsNullOrWhiteSpace(proof) || deviceName.Length > 64)
        {
            await SendPlainAsync(socket, new { v = 2, t = "pair2err", d = new { code = "invalid_request", message = "Faltan datos de emparejamiento." } }, token);
            await CloseAsync(socket, 4400, "invalid request");
            return false;
        }

        var secret = _pairing.VerifyAndroidPairing(host.ServerId, deviceId, nonceC, proof);
        if (secret is null)
        {
            await SendPlainAsync(socket, new { v = 2, t = "pair2err", d = new { code = "invalid_pairing", message = "El código venció o ya se usó. Generá otro en la PC." } }, token);
            await CloseAsync(socket, 4401, "invalid pairing");
            return false;
        }

        var nonceS = V2.RandomB64(16);
        var deviceKey = V2.Hkdf(V2.FromB64Url(secret), Encoding.UTF8.GetBytes(deviceId),
            $"vexadeck-device-key|{host.ServerId}|{nonceC}|{nonceS}", 32);
        var protectedKey = Dpapi.Protect(V2.B64Url(deviceKey));
        if (protectedKey is null)
        {
            await SendPlainAsync(socket, new { v = 2, t = "pair2err", d = new { code = "key_storage_failed", message = "No se pudo guardar la clave del celular." } }, token);
            await CloseAsync(socket, 1011, "key storage failed");
            return false;
        }

        _config.AddDevice(new DeviceConfig(
            deviceId, deviceName.Trim(), string.Empty, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow,
            protectedKey, 2, "lan", "android"));
        await SendPlainAsync(socket, new { v = 2, t = "pair2ok", d = new { nonceS } }, token);
        AppLog.Info($"Android emparejado: {deviceName.Trim()}");
        return true;
    }

    private async Task<ClientSession?> AuthenticateV2Async(System.Net.WebSockets.WebSocket socket, JsonElement root, CancellationToken token)
    {
        if (!root.TryGetProperty("d", out var data))
        {
            await CloseAsync(socket, 4400, "missing hello2 data");
            return null;
        }
        var deviceId = ReadString(data, "deviceId");
        var nonceC = ReadString(data, "nonceC");
        var device = string.IsNullOrWhiteSpace(deviceId) ? null : _config.FindDeviceById(deviceId);
        var keyText = device?.DeviceKeyProtected is null ? null : Dpapi.Unprotect(device.DeviceKeyProtected);

        if (device is null || keyText is null || string.IsNullOrWhiteSpace(nonceC))
        {
            await SendPlainAsync(socket, new { v = 2, t = "error", d = new { code = "unauthorized", message = "Este celular no está emparejado con esta PC." } }, token);
            await CloseAsync(socket, 4403, "unauthorized");
            return null;
        }

        var host = _identity.Ensure();
        var deviceKey = V2.FromB64Url(keyText);
        var nonceS = V2.RandomB64(16);
        await SendPlainAsync(socket, new { v = 2, t = "challenge", d = new { serverId = host.ServerId, nonceS } }, token);

        using var auth = await ReceiveJsonAsync(socket, token);
        if (auth is null)
        {
            await CloseAsync(socket, 4401, "auth expected");
            return null;
        }
        var proof = auth.RootElement.TryGetProperty("d", out var authData) ? ReadString(authData, "proof") : null;
        var expected = V2.HmacB64(deviceKey, $"auth|{host.ServerId}|{nonceS}|{nonceC}");
        if (string.IsNullOrWhiteSpace(proof) || !V2.FixedEquals(expected, proof))
        {
            await SendPlainAsync(socket, new { v = 2, t = "error", d = new { code = "unverified", message = "No se pudo verificar esta PC." } }, token);
            await CloseAsync(socket, 4401, "auth failed");
            return null;
        }

        var sessionKey = V2.Hmac(deviceKey, $"sess|{host.ServerId}|{nonceS}|{nonceC}");
        return new ClientSession
        {
            DeviceId = device.Id,
            Socket = socket,
            IsV2 = true,
            Outbound = new SignedChannel(sessionKey, "s2c"),
            Inbound = new SignedChannel(sessionKey, "c2s")
        };
    }

    private object? HandleV2Message(ClientSession session, JsonElement root)
    {
        var kind = root.TryGetProperty("t", out var tEl) ? tEl.GetString() : null;
        var id = root.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
        var hasData = root.TryGetProperty("d", out var data);

        switch (kind)
        {
            case "ping":
                return new { v = 2, t = "pong", id, d = hasData ? data : default };

            case "profile.pin":
            {
                var profileId = hasData ? ReadString(data, "profileId") : null;
                _profileResolver.PinProfile(profileId);
                return null;
            }

            case "profile.select":
            {
                var profileId = hasData ? ReadString(data, "profileId") : null;
                _profileResolver.SelectProfile(profileId);
                return null;
            }

            case "profile.builtIn":
            {
                if (!hasData) return null;
                var profileId = ReadString(data, "profileId");
                var enabled = data.TryGetProperty("enabled", out var enabledElement) && enabledElement.ValueKind == JsonValueKind.True;
                SetBuiltInProfile(profileId, enabled);
                return null;
            }

            case "clipboard.send":
            {
                if (!hasData) return null;
                var text = ReadString(data, "text");
                var paste = data.TryGetProperty("paste", out var pasteEl) && pasteEl.ValueKind == JsonValueKind.True;
                if (!string.IsNullOrEmpty(text))
                {
                    _clipboard.SetText(text);
                    if (paste)
                    {
                        Thread.Sleep(50);
                        _input.SendHotkey(["ctrl", "v"]);
                    }
                }
                return null;
            }

            case "clipboard.getHistory":
                return new { v = 2, t = "clipboard.history", id, d = new { items = _clipboard.GetHistory() } };

            case "action":
            {
                if (!hasData) return null;
                var buttonId = ReadString(data, "buttonId") ?? "";
                var value = data.TryGetProperty("value", out var valEl) ? valEl : default;
                var error = ExecuteAction(buttonId, value, data);
                if (error is not null)
                {
                    return new { v = 2, t = "error", id, d = new { code = "action_failed", message = error } };
                }
                if (IsPowerAction(buttonId))
                {
                    // The phone shows the PC name in the confirmation dialog.
                    return new { v = 2, t = "action.ok", id, d = new { pcName = _identity.PcName } };
                }
                return null;
            }

            case "layout.reorder":
            {
                if (!hasData) return null;
                var profileId = ReadString(data, "profileId");
                var pageId = ReadString(data, "pageId");
                if (profileId is null || pageId is null || !data.TryGetProperty("buttons", out var buttonsElement)) return null;
                var cfg = _config.Read();
                var profile = cfg.Profiles.FirstOrDefault(item => item.Id == profileId);
                var page = profile?.Pages.FirstOrDefault(item => item.Id == pageId);
                if (profile is null || page is null) return null;
                var buttons = JsonSerializer.Deserialize<List<ButtonConfig>>(buttonsElement.GetRawText(), ConfigService.JsonOptions);
                if (buttons is null) return null;
                var pages = profile.Pages.Select(item => item.Id == pageId ? item with { Buttons = buttons } : item).ToList();
                var profiles = cfg.Profiles.Select(item => item.Id == profileId ? item with { Pages = pages } : item).ToList();
                _config.Save(cfg with { Profiles = profiles });
                Broadcast(JsonSerializer.SerializeToUtf8Bytes(new
                {
                    v = 1,
                    t = "config.updated",
                    d = new { config = _config.Read() with { Devices = [] }, configRevision = _config.Read().Revision }
                }, ConfigService.JsonOptions));
                return new { v = 2, t = "layout.reordered", id, d = new { ok = true } };
            }

            default:
                return new { v = 2, t = "error", id, d = new { code = "unsupported_message", message = "Mensaje no disponible todavía." } };
        }
    }

    /// <summary>Adds or removes one of the optional built-in profiles (Spotify, Gamer).</summary>
    private void SetBuiltInProfile(string? profileId, bool enabled)
    {
        if (string.IsNullOrWhiteSpace(profileId)) return;
        if (!ConfigService.OptionalProfileIds.Contains(profileId)) return;

        var config = _config.Read();
        var disabled = (config.DisabledProfiles ?? []).Where(id => id != profileId).ToList();
        if (!enabled) disabled.Add(profileId);

        _config.Save(config with
        {
            Profiles = enabled ? config.Profiles : config.Profiles.Where(profile => profile.Id != profileId).ToList(),
            DisabledProfiles = disabled
        });
        BroadcastConfig();
    }

    private void BroadcastConfig()
    {
        var config = _config.Read();
        Broadcast(JsonSerializer.SerializeToUtf8Bytes(new
        {
            v = 1,
            t = "config.updated",
            d = new { config = config with { Devices = [] }, configRevision = config.Revision }
        }, ConfigService.JsonOptions));
    }

    private bool IsPowerAction(string buttonId)
    {
        if (buttonId.StartsWith("quick_power_", StringComparison.Ordinal)) return true;
        if (string.IsNullOrEmpty(buttonId)) return false;
        var button = _config.Read().Profiles
            .SelectMany(profile => profile.Pages)
            .SelectMany(page => page.Buttons)
            .FirstOrDefault(item => item.Id == buttonId);
        return button?.Action?.Kind == "power";
    }

    private static string? ReadString(JsonElement element, string property) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static async Task<JsonDocument?> ReceiveJsonAsync(System.Net.WebSockets.WebSocket socket, CancellationToken token)
    {
        var buffer = new byte[64 * 1024];
        using var message = new MemoryStream();
        System.Net.WebSockets.WebSocketReceiveResult result;
        do
        {
            result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), token);
            if (result.MessageType == System.Net.WebSockets.WebSocketMessageType.Close) return null;
            if (message.Length + result.Count > 64 * 1024) return null;
            message.Write(buffer, 0, result.Count);
        } while (!result.EndOfMessage);

        try { return JsonDocument.Parse(message.ToArray()); }
        catch (JsonException) { return null; }
    }

    private static Task SendPlainAsync(System.Net.WebSockets.WebSocket socket, object payload, CancellationToken token) =>
        socket.SendAsync(
            Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload, ConfigService.JsonOptions)),
            System.Net.WebSockets.WebSocketMessageType.Text, true, token);

    private static async Task CloseAsync(System.Net.WebSockets.WebSocket socket, int code, string reason)
    {
        try
        {
            if (socket.State == System.Net.WebSockets.WebSocketState.Open ||
                socket.State == System.Net.WebSockets.WebSocketState.CloseReceived)
            {
                await socket.CloseAsync((System.Net.WebSockets.WebSocketCloseStatus)code, reason, CancellationToken.None);
            }
        }
        catch { }
    }

    private sealed record PreparedConfig(AppConfig Config, List<object> Errors, List<string> Warnings);

    private PreparedConfig PrepareConfig(AppConfig updated)
    {
        updated = _config.Migrate(updated);
        var errors = new List<object>();
        var warnings = new List<string>();
        var profiles = new List<ProfileConfig>();

        foreach (var profile in updated.Profiles)
        {
            foreach (var page in profile.Pages)
            {
                foreach (var button in page.Buttons)
                {
                    var action = button.Action;
                    if (action is null) continue;
                    var validation = _schemas.Validate(action.Kind, action.Params);
                    if (validation.Count == 0) continue;
                    errors.Add(new
                    {
                        profileId = profile.Id,
                        pageId = page.Id,
                        buttonId = button.Id,
                        label = button.Label,
                        errors = validation.Select(error => new { error.Param, error.Code, error.Message })
                    });
                }
            }

            var fixedProfile = GridService.FixOutOfRange(profile);
            warnings.AddRange(fixedProfile.Warnings.Select(warning => $"{profile.Name}: {warning}"));

            var enrichedPages = fixedProfile.Profile.Pages.Select(page => page with
            {
                Buttons = page.Buttons.Select(button =>
                {
                    var resolved = ResolveIcon(button, out var iconUpdated);
                    if (iconUpdated && resolved.Icon?.Kind == "lucide" && button.Action?.Kind == "launch")
                    {
                        warnings.Add($"«{button.Label}»: no se pudo extraer el ícono de la app; se usó el ícono sugerido.");
                    }
                    return resolved;
                }).ToList()
            }).ToList();

            profiles.Add(fixedProfile.Profile with { Pages = enrichedPages });
        }

        return new(updated with { Profiles = profiles }, errors, warnings);
    }

    /// <summary>Igual que <see cref="RunSpotifyCommandAsync"/> pero sin bloquear el WebSocket.</summary>
    private void RunSpotifyCommandInBackground(string command) =>
        _ = Task.Run(async () =>
        {
            try { await RunSpotifyCommandAsync(command, CancellationToken.None); }
            catch (SpotifyException ex) { AppLog.Warn($"Spotify: {ex.Message}"); }
            catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException)
            {
                AppLog.Warn($"Spotify sin respuesta: {ex.Message}");
            }
        });

    /// <summary>
    /// Comandos de Spotify compartidos por la botonera y el panel. Lanza
    /// <see cref="SpotifyException"/> con un mensaje mostrable al usuario.
    /// </summary>
    private async Task<SpotifyTrackInfo?> RunSpotifyCommandAsync(string command, CancellationToken token)
    {
        switch (command)
        {
            case "next": await _spotify.NextAsync(token); break;
            case "prev":
            case "previous": await _spotify.PreviousAsync(token); break;
            case "playpause":
            case "toggle":
            case "play":
            case "pause": await _spotify.TogglePlaybackAsync(token); break;
            case "nowplaying": return await _spotify.GetCurrentlyPlayingAsync(token);
            default: throw new SpotifyException("Comando de Spotify desconocido.");
        }
        return await _spotify.GetCurrentlyPlayingAsync(token);
    }

    private string? ExecuteAction(string buttonId, JsonElement val, JsonElement rawData = default)
    {
        // 1. Quick utility actions
        if (buttonId == "quick_audio_cycle")
        {
            _audio.CycleDefaultPlaybackDevice();
            return null;
        }
        if (buttonId == "quick_mute_all")
        {
            _audio.ToggleMasterMute();
            _audio.ToggleMicMute();
            return null;
        }
        if (buttonId.StartsWith("quick_power_"))
        {
            var cmd = buttonId["quick_power_".Length..];
            if (cmd == "lock") _power.Lock();
            else if (cmd == "sleep") _power.Sleep();
            else if (cmd == "shutdown") return _power.Shutdown(true);
            else if (cmd == "restart") return _power.Restart(true);
            else if (cmd == "cancel") _power.CancelShutdown();
            return null;
        }

        string kind = "";
        Dictionary<string, object?>? prms = null;

        // 2. Resolve button from config
        if (!string.IsNullOrEmpty(buttonId))
        {
            var cfg = _config.Read();
            var button = cfg.Profiles
                .SelectMany(p => p.Pages)
                .SelectMany(p => p.Buttons)
                .FirstOrDefault(b => b.Id == buttonId);

            if (button?.Action is not null)
            {
                kind = button.Action.Kind;
                prms = button.Action.Params;
            }
        }

        // 3. Direct action fallback
        if (string.IsNullOrEmpty(kind) && rawData.ValueKind == JsonValueKind.Object)
        {
            if (rawData.TryGetProperty("kind", out var k) || rawData.TryGetProperty("type", out k))
            {
                kind = k.GetString() ?? "";
            }
            if (rawData.TryGetProperty("params", out var p) || rawData.TryGetProperty("payload", out p))
            {
                if (p.ValueKind == JsonValueKind.Object)
                {
                    prms = JsonSerializer.Deserialize<Dictionary<string, object?>>(p.GetRawText());
                }
            }
            if (prms is null && rawData.TryGetProperty("target", out var tgt))
            {
                prms = new Dictionary<string, object?> { ["target"] = tgt.GetString() ?? "" };
            }
        }

        if (string.IsNullOrEmpty(kind)) return null;
        prms ??= new Dictionary<string, object?>();

        // Normalize aliases from v0.1 configs and direct action payloads.
        var originalKind = kind;
        kind = kind switch
        {
            "audio.mute" => "mute.toggle",
            "mic.mute" => "mute.toggle",
            "audio.deviceCycle" => "audio.device",
            "text" or "type" => "text.type",
            "script" => "script.run",
            "chrome" => "browser",
            "open_url" or "url.open" => "url",
            _ => kind
        };
        if (originalKind == "mic.mute")
        {
            prms["target"] = "mic";
        }
        if (kind == "mute.toggle" && prms.ContainsKey("process") && !prms.ContainsKey("target"))
        {
            prms["target"] = "app";
        }

        try
        {
            switch (kind)
            {
                case "hotkey":
                {
                    if (prms.TryGetValue("keys", out var rawKeys))
                    {
                        var keys = ParseStringList(rawKeys);
                        _input.SendHotkey(keys);
                    }
                    break;
                }

                case "text.type":
                case "type":
                case "text":
                {
                    var text = prms.TryGetValue("text", out var rawText) ? rawText?.ToString() : (prms.TryGetValue("value", out var v) ? v?.ToString() : null);
                    if (!string.IsNullOrEmpty(text))
                    {
                        _input.TypeText(text);
                    }
                    break;
                }

                case "media":
                {
                    var cmd = prms.TryGetValue("cmd", out var rawCmd) ? rawCmd?.ToString() : (prms.TryGetValue("target", out var tgt) ? tgt?.ToString() : null);
                    if (!string.IsNullOrEmpty(cmd))
                    {
                        _media.Execute(cmd);
                        _ = Task.Delay(200).ContinueWith(_ => _nowPlaying.RefreshNowPlayingAsync());
                    }
                    break;
                }

                case "spotify":
                {
                    if (!_spotify.IsLinked)
                    {
                        return "Vinculá tu cuenta de Spotify desde el panel de VexaDeck.";
                    }
                    var command = ParamReader.GetString(prms, "cmd") ?? "playpause";
                    RunSpotifyCommandInBackground(command);
                    break;
                }

                case "volume.master":
                {
                    var volume = GetFloatValue(val, prms, "value", 50f);
                    _audio.SetMasterVolume(volume);
                    break;
                }

                case "volume.app":
                {
                    var process = prms.TryGetValue("process", out var proc) ? proc?.ToString() ?? "" : "";
                    var volume = GetFloatValue(val, prms, "value", 50f);
                    _audio.SetAppVolume(process, volume);
                    break;
                }

                case "mute.toggle":
                {
                    var target = prms.TryGetValue("target", out var t) ? t?.ToString()?.ToLowerInvariant() : "master";
                    var process = prms.TryGetValue("process", out var proc) ? proc?.ToString() ?? "" : "";

                    if (target == "mic") _audio.ToggleMicMute();
                    else if (target == "app") _audio.ToggleAppMute(process);
                    else _audio.ToggleMasterMute();
                    break;
                }

                case "audio.device":
                {
                    var flow = ParamReader.GetString(prms, "flow") ?? "output";
                    var mode = ParamReader.GetString(prms, "mode") ?? "cycle";
                    if (mode.Equals("specific", StringComparison.OrdinalIgnoreCase))
                    {
                        var deviceId = ParamReader.GetString(prms, "deviceId");
                        if (string.IsNullOrWhiteSpace(deviceId)) return "Elegí un dispositivo de audio.";
                        if (!_audio.SetDefaultDevice(flow, deviceId)) return "No se encontró el dispositivo de audio elegido.";
                    }
                    else
                    {
                        var devices = ParamReader.GetStringList(prms, "devices");
                        if (!_audio.CycleDefaultDevice(flow, devices)) return "No hay otros dispositivos de audio disponibles.";
                    }
                    break;
                }

                case "power":
                {
                    var cmd = prms.TryGetValue("cmd", out var c) ? c?.ToString()?.ToLowerInvariant() : "";
                    var confirmed = prms.TryGetValue("confirmed", out var conf) && (conf is true || conf?.ToString()?.Equals("true", StringComparison.OrdinalIgnoreCase) == true);
                    if (cmd == "lock") _power.Lock();
                    else if (cmd == "sleep") _power.Sleep();
                    else if (cmd == "shutdown") return _power.Shutdown(confirmed);
                    else if (cmd == "restart") return _power.Restart(confirmed);
                    else if (cmd == "cancel") _power.CancelShutdown();
                    break;
                }

                case "script.run":
                case "script":
                {
                    var file = prms.TryGetValue("file", out var f) ? f?.ToString() : (prms.TryGetValue("id", out var sid) ? sid?.ToString() : null);
                    if (!string.IsNullOrEmpty(file))
                    {
                        if (!_scripts.ExecuteScript(file))
                        {
                            _scripts.RunFile(file);
                        }
                    }
                    break;
                }

                case "launch":
                {
                    var path = ParamReader.GetString(prms, "path");
                    if (!string.IsNullOrWhiteSpace(path))
                    {
                        var args = ParamReader.GetString(prms, "args") ?? "";
                        if (path.StartsWith("shell:AppsFolder\\", StringComparison.OrdinalIgnoreCase))
                        {
                            Process.Start(new ProcessStartInfo
                            {
                                FileName = "explorer.exe",
                                Arguments = path,
                                UseShellExecute = true
                            });
                        }
                        else if (path.Contains('!') && !path.Contains('\\') && !path.Contains('/'))
                        {
                            Process.Start(new ProcessStartInfo
                            {
                                FileName = "explorer.exe",
                                Arguments = $"shell:AppsFolder\\{path}",
                                UseShellExecute = true
                            });
                        }
                        else
                        {
                            Process.Start(new ProcessStartInfo(path, args) { UseShellExecute = true });
                        }
                    }
                    break;
                }

                case "url":
                case "open_url":
                case "url.open":
                {
                    var url = prms.TryGetValue("url", out var u) ? u?.ToString() : (prms.TryGetValue("path", out var p) ? p?.ToString() : (prms.TryGetValue("value", out var v) ? v?.ToString() : null));
                    if (!string.IsNullOrWhiteSpace(url))
                    {
                        if (!url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
                            !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                        {
                            url = "https://" + url;
                        }
                        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
                    }
                    break;
                }

                case "browser":
                case "chrome":
                {
                    var cmd = prms.TryGetValue("cmd", out var c) ? c?.ToString()?.ToLowerInvariant() : (prms.TryGetValue("action", out var a) ? a?.ToString()?.ToLowerInvariant() : "");
                    switch (cmd)
                    {
                        case "tab.new":
                        case "new_tab":
                            _input.SendHotkey(new[] { "ctrl", "t" });
                            break;
                        case "tab.close":
                        case "close_tab":
                            _input.SendHotkey(new[] { "ctrl", "w" });
                            break;
                        case "tab.reopen":
                        case "reopen_tab":
                            _input.SendHotkey(new[] { "ctrl", "shift", "t" });
                            break;
                        case "tab.next":
                        case "next_tab":
                            _input.SendHotkey(new[] { "ctrl", "pagedown" });
                            break;
                        case "tab.prev":
                        case "prev_tab":
                            _input.SendHotkey(new[] { "ctrl", "pageup" });
                            break;
                        case "page.reload":
                        case "reload":
                            _input.SendHotkey(new[] { "f5" });
                            break;
                        case "page.hard_reload":
                        case "hard_reload":
                            _input.SendHotkey(new[] { "ctrl", "f5" });
                            break;
                        case "devtools":
                        case "inspect":
                            _input.SendHotkey(new[] { "f12" });
                            break;
                        case "bookmark":
                            _input.SendHotkey(new[] { "ctrl", "d" });
                            break;
                        case "history":
                            _input.SendHotkey(new[] { "ctrl", "h" });
                            break;
                        case "downloads":
                            _input.SendHotkey(new[] { "ctrl", "j" });
                            break;
                        case "incognito":
                            _input.SendHotkey(new[] { "ctrl", "shift", "n" });
                            break;
                        case "window.new":
                        case "new_window":
                            _input.SendHotkey(new[] { "ctrl", "n" });
                            break;
                        case "address_bar":
                            _input.SendHotkey(new[] { "ctrl", "l" });
                            break;
                        case "find":
                            _input.SendHotkey(new[] { "ctrl", "f" });
                            break;
                        case "zoom.in":
                            _input.SendHotkey(new[] { "ctrl", "add" });
                            break;
                        case "zoom.out":
                            _input.SendHotkey(new[] { "ctrl", "subtract" });
                            break;
                        case "zoom.reset":
                            _input.SendHotkey(new[] { "ctrl", "0" });
                            break;
                    }
                    break;
                }

                case "folder.open":
                {
                    var pageId = ParamReader.GetString(prms, "pageId");
                    if (string.IsNullOrWhiteSpace(pageId)) return "Elegí una página para abrir.";
                    var profile = _config.Read().Profiles.FirstOrDefault(p => p.Pages.Any(pg => pg.Id == pageId));
                    if (profile is null) return "La página elegida ya no existe.";
                    Broadcast(JsonSerializer.SerializeToUtf8Bytes(new
                    {
                        v = 1,
                        t = "page.open",
                        d = new { profileId = profile.Id, pageId }
                    }, ConfigService.JsonOptions));
                    break;
                }

                case "page.next":
                {
                    Broadcast(JsonSerializer.SerializeToUtf8Bytes(new
                    {
                        v = 1,
                        t = "page.cycle",
                        d = new { direction = "next" }
                    }, ConfigService.JsonOptions));
                    break;
                }

                case "page.prev":
                {
                    Broadcast(JsonSerializer.SerializeToUtf8Bytes(new
                    {
                        v = 1,
                        t = "page.cycle",
                        d = new { direction = "prev" }
                    }, ConfigService.JsonOptions));
                    break;
                }

                case "page.goto":
                {
                    var pageId = ParamReader.GetString(prms, "pageId");
                    if (string.IsNullOrWhiteSpace(pageId)) return "Elegí una página para abrir.";
                    var profile = _config.Read().Profiles.FirstOrDefault(p => p.Pages.Any(pg => pg.Id == pageId));
                    if (profile is null) return "La página elegida ya no existe.";
                    Broadcast(JsonSerializer.SerializeToUtf8Bytes(new
                    {
                        v = 1,
                        t = "page.open",
                        d = new { profileId = profile.Id, pageId }
                    }, ConfigService.JsonOptions));
                    break;
                }

                case "profile.switch":
                {
                    var profileId = ParamReader.GetString(prms, "profileId");
                    if (string.IsNullOrWhiteSpace(profileId) ||
                        profileId.Equals("auto", StringComparison.OrdinalIgnoreCase))
                    {
                        // "Automático": drop the pin and let the foreground app decide again.
                        _profileResolver.PinProfile(null);
                        break;
                    }
                    if (
                        !_config.Read().Profiles.Any(p => p.Id == profileId))
                    {
                        return "El perfil elegido ya no existe.";
                    }
                    _profileResolver.SelectProfile(profileId);
                    break;
                }

                case "profile.next":
                    _profileResolver.CycleProfile(1);
                    break;

                case "profile.prev":
                    _profileResolver.CycleProfile(-1);
                    break;

                case "profile.pin":
                {
                    var profileId = ParamReader.GetString(prms, "profileId");
                    if (!string.IsNullOrWhiteSpace(profileId) &&
                        !_config.Read().Profiles.Any(p => p.Id == profileId))
                    {
                        return "El perfil elegido ya no existe.";
                    }
                    _profileResolver.PinProfile(string.IsNullOrWhiteSpace(profileId) ? null : profileId);
                    break;
                }

                case "clipboard.copy":
                    _input.SendHotkey(["ctrl", "c"]);
                    break;

                case "clipboard.cut":
                    _input.SendHotkey(["ctrl", "x"]);
                    break;

                case "clipboard.paste":
                    _input.SendHotkey(["ctrl", "v"]);
                    break;

                case "clipboard.paste_plain":
                {
                    if (!_clipboard.TryGetText(out var text) || string.IsNullOrEmpty(text))
                    {
                        return "El portapapeles no tiene texto para pegar.";
                    }
                    if (!_clipboard.TrySetText(text, suppressHistory: true))
                    {
                        return "No se pudo preparar el portapapeles. Otra app lo está usando.";
                    }
                    Thread.Sleep(30);
                    _input.SendHotkey(["ctrl", "v"]);
                    break;
                }

                case "clipboard.snippet":
                {
                    var text = ParamReader.GetString(prms, "text");
                    if (string.IsNullOrEmpty(text)) return "El texto del snippet está vacío.";
                    var restore = ParamReader.GetBool(prms, "restore", true);
                    var pressEnter = ParamReader.GetBool(prms, "pressEnter");
                    var hadPrevious = _clipboard.TryGetText(out var previous);

                    if (!_clipboard.TrySetText(text, suppressHistory: true))
                    {
                        return "No se pudo copiar el snippet. Otra app está usando el portapapeles.";
                    }
                    Thread.Sleep(30);
                    _input.SendHotkey(["ctrl", "v"]);

                    if (restore && hadPrevious && !string.IsNullOrEmpty(previous))
                    {
                        Thread.Sleep(150);
                        _clipboard.TrySetText(previous, suppressHistory: true);
                    }
                    if (pressEnter)
                    {
                        Thread.Sleep(30);
                        _input.SendHotkey(["enter"]);
                    }
                    break;
                }
            }
        }
        catch (Exception ex)
        {
            AppLog.Warn($"Action '{kind}' failed: {ex.Message}");
            return "No se pudo ejecutar la acción.";
        }
        return null;
    }

    private bool AllowIdent(IPAddress? address)
    {
        var key = address?.MapToIPv4().ToString() ?? "unknown";
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var entry = _identRate.AddOrUpdate(key,
            _ => (now, 1),
            (_, current) => now - current.Window > 60 ? (now, 1) : (current.Window, current.Count + 1));
        return entry.Count <= 120;
    }

    private static List<string> ParseStringList(object raw)
    {
        if (raw is IEnumerable<string> listStr) return listStr.ToList();
        if (raw is JsonElement elem && elem.ValueKind == JsonValueKind.Array)
        {
            var res = new List<string>();
            foreach (var item in elem.EnumerateArray())
            {
                var s = item.GetString();
                if (!string.IsNullOrEmpty(s)) res.Add(s);
            }
            return res;
        }
        return [];
    }

    private static float GetFloatValue(JsonElement val, Dictionary<string, object?> prms, string key, float fallback)
    {
        if (val.ValueKind == JsonValueKind.Number && val.TryGetSingle(out var v)) return v;
        if (prms.TryGetValue(key, out var p) && p is not null)
        {
            if (p is JsonElement je && je.ValueKind == JsonValueKind.Number && je.TryGetSingle(out var f)) return f;
            if (float.TryParse(p.ToString(), out var parsed)) return parsed;
        }
        return fallback;
    }

    private static bool IsPrivateOrLoopback(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
        if (IPAddress.IsLoopback(address)) return true;
        if (address.AddressFamily == AddressFamily.InterNetwork)
        {
            var b = address.GetAddressBytes();
            return b[0] == 10 || b[0] == 192 && b[1] == 168 || b[0] == 172 && b[1] is >= 16 and <= 31 || b[0] == 169 && b[1] == 254;
        }
        return address.IsIPv6LinkLocal || address.IsIPv6SiteLocal || address.ToString().StartsWith("fc", StringComparison.OrdinalIgnoreCase) || address.ToString().StartsWith("fd", StringComparison.OrdinalIgnoreCase);
    }

    private static string GetLanAddress() => NetworkInterface.GetAllNetworkInterfaces().Where(n => n.OperationalStatus == OperationalStatus.Up).SelectMany(n => n.GetIPProperties().UnicastAddresses).Select(a => a.Address).FirstOrDefault(a => a.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(a) && IsPrivateOrLoopback(a))?.ToString() ?? "No disponible";
    
    public async Task StopAsync()
    {
        _mdns?.Dispose();
        _mdns = null;
        _stop.Cancel();
        if (_app is not null) await _app.StopAsync();
        if (_certificateWatcher is not null) await _certificateWatcher;
        if (_telemetryLoop is not null) await _telemetryLoop;
    }
    
    public void Dispose()
    {
        DisposeAsync().AsTask().GetAwaiter().GetResult();
    }

    public async ValueTask DisposeAsync()
    {
        _mdns?.Dispose();
        _mdns = null;
        _adb.Shutdown();
        await _spotify.DisposeAsync();
        if (_app is not null) await _app.DisposeAsync();
        _nowPlaying.Dispose();
        _clipboard.Dispose();
        _foregroundWatcher.Dispose();
        _audio.Dispose();
        _telemetry.Dispose();
        _certificates.Dispose();
        _stop.Dispose();
    }
}

internal sealed record PairRequest(string? Code, string? DeviceName);
internal sealed record HostUpdateRequest(string? PcName, string? PcColor, string? PcIcon, bool? UsbEnabled, bool? WolEnabled, int? WolPort);
internal sealed record UsbToggleRequest(bool Enabled);
internal sealed record UsbApproveRequest(string Serial, bool Approved);
internal sealed record SerialRequest(string Serial);
internal sealed record AdbPathRequest(string? Path);
internal sealed record WolTestRequest(string? Mac);
internal sealed record OpenFolderRequest(string? Target);
internal sealed record ScriptTestRequest(string? File);
internal sealed record PickFileRequest(string? Kind);
internal sealed record IconRequest(string? Target);
internal sealed record SpotifyClientIdRequest(string? ClientId);
internal sealed record SpotifyCommandRequest(string? Command);
