using System.Text.Json;
using System.Text.Json.Serialization;
using System.Security.Cryptography;

namespace NexoDeck.Server.Services;

internal sealed class ConfigService
{
    private readonly string _path;
    private readonly ActionSchemaService _schemas;
    private readonly SemaphoreSlim _gate = new(1, 1);
    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter(), new IconConfigConverter(), new TelemetryConfigConverter() }
    };

    public ActionSchemaService Schemas => _schemas;

    public ConfigService(string dataDir, ActionSchemaService schemas)
    {
        _schemas = schemas;
        _path = Path.Combine(dataDir, "config.json");
        if (!File.Exists(_path))
        {
            Save(CreateDefault());
            return;
        }

        // Mandatory migration: Write() copies the previous file to config.bak.json first.
        try
        {
            var current = JsonSerializer.Deserialize<AppConfig>(File.ReadAllText(_path), JsonOptions);
            if (current is not null)
            {
                var migrated = Migrate(current);
                var normalized = WithBuiltIns(migrated);
                if (!ReferenceEquals(normalized, current))
                {
                    Write(normalized);
                }
            }
        }
        catch (JsonException) { }
    }

    public AppConfig Migrate(AppConfig config) => ConfigMigrator.Migrate(config, _schemas);

    /// <summary>Profiles that ship with the app but can be removed by the user.</summary>
    public static readonly string[] OptionalProfileIds = ["spotify", "gamer"];

    /// <summary>
    /// Seeds the built-in profiles on first run and keeps them in sync with
    /// <see cref="AppConfig.DisabledProfiles"/>. Once a profile exists the user
    /// owns it: its pages, buttons and positions are never overwritten here.
    /// </summary>
    public static AppConfig WithBuiltIns(AppConfig config)
    {
        var disabled = config.DisabledProfiles ?? [];
        var profiles = config.Profiles.ToList();
        var changed = false;

        var spotifyIndex = profiles.FindIndex(profile => profile.Id == "spotify");
        if (disabled.Contains("spotify"))
        {
            if (spotifyIndex >= 0)
            {
                profiles.RemoveAt(spotifyIndex);
                changed = true;
            }
        }
        else if (spotifyIndex < 0)
        {
            profiles.Insert(InsertAfter(profiles, config.DefaultProfileId), SpotifyProfile());
            changed = true;
        }

        var gamerIndex = profiles.FindIndex(profile => profile.Id == "gamer");
        if (disabled.Contains("gamer"))
        {
            if (gamerIndex >= 0)
            {
                profiles.RemoveAt(gamerIndex);
                changed = true;
            }
        }
        else if (gamerIndex < 0)
        {
            profiles.Insert(InsertAfter(profiles, profiles.Any(profile => profile.Id == "spotify") ? "spotify" : config.DefaultProfileId), GamerProfile());
            changed = true;
        }

        return changed ? config with { Profiles = profiles } : config;
    }

    private static int InsertAfter(List<ProfileConfig> profiles, string id)
    {
        var index = profiles.FindIndex(profile => profile.Id == id);
        return index < 0 ? profiles.Count : index + 1;
    }

    /// <summary>Editable default deck for games: the user can change every button or delete it.</summary>
    public static ProfileConfig GamerProfile() => new(
        Id: "gamer",
        Name: "Gamer",
        Accent: "#FF4655",
        Grid: new GridConfig(4, 3),
        GridPortrait: new GridConfig(3, 4),
        Pages: [
            new PageConfig("p_gm", "En juego", [
                new("gm_bar", "action", "Game Bar", new("lucide", "gamepad-2"), new(0, 0), new("hotkey", new() { ["keys"] = new[] { "win", "g" } })),
                new("gm_shot", "action", "Captura", new("lucide", "camera"), new(0, 1), new("hotkey", new() { ["keys"] = new[] { "win", "alt", "prtscn" } })),
                new("gm_rec", "action", "Grabar clip", new("lucide", "circle-dot"), new(0, 2), new("hotkey", new() { ["keys"] = new[] { "win", "alt", "r" } })),
                new("gm_tab", "action", "Alt+Tab", new("lucide", "app-window"), new(0, 3), new("hotkey", new() { ["keys"] = new[] { "alt", "tab" } })),

                new("gm_mic", "toggle", "Micrófono", new("lucide", "mic-off"), new(1, 0), new("mute.toggle", new() { ["target"] = "mic" }), "mic.muted"),
                new("gm_discord", "action", "Discord mute", new("lucide", "headphones"), new(1, 1), new("hotkey", new() { ["keys"] = new[] { "ctrl", "shift", "m" } })),
                new("gm_volup", "action", "Volumen +", new("lucide", "volume-2"), new(1, 2), new("media", new() { ["cmd"] = "volup" })),
                new("gm_voldown", "action", "Volumen -", new("lucide", "volume-1"), new(1, 3), new("media", new() { ["cmd"] = "voldown" })),

                new("gm_esc", "action", "Esc", new("lucide", "undo-2"), new(2, 0), new("hotkey", new() { ["keys"] = new[] { "esc" } })),
                new("gm_win", "action", "Windows", new("lucide", "square"), new(2, 1), new("hotkey", new() { ["keys"] = new[] { "win" } })),
                new("gm_desk", "action", "Escritorio", new("lucide", "monitor"), new(2, 2), new("hotkey", new() { ["keys"] = new[] { "win", "d" } })),
                new("gm_full", "action", "Pantalla completa", new("lucide", "maximize"), new(2, 3), new("hotkey", new() { ["keys"] = new[] { "f11" } }))
            ])
        ],
        Match: new MatchConfig([])
    );

    public static ProfileConfig SpotifyProfile() => new(
        Id: "spotify",
        Name: "Spotify",
        Accent: "#1DB954",
        Grid: new GridConfig(5, 1),
        GridPortrait: new GridConfig(5, 1),
        Pages: [
            new PageConfig("p_sp", "Reproductor", [
                new("sp_prev", "action", "Anterior", new("lucide", "skip-back"), new(0, 0), new("media", new() { ["cmd"] = "prev" })),
                new("sp_play", "action", "Play / pausa", new("lucide", "play"), new(0, 1), new("media", new() { ["cmd"] = "playpause" })),
                new("sp_next", "action", "Siguiente", new("lucide", "skip-forward"), new(0, 2), new("media", new() { ["cmd"] = "next" })),
                new("sp_voldown", "action", "Bajar volumen", new("lucide", "volume-1"), new(0, 3), new("media", new() { ["cmd"] = "voldown" })),
                new("sp_volup", "action", "Subir volumen", new("lucide", "volume-2"), new(0, 4), new("media", new() { ["cmd"] = "volup" }))
            ])
        ],
        Match: new MatchConfig(["spotify.exe"])
    );

    public AppConfig Read()
    {
        var backup = Path.Combine(Path.GetDirectoryName(_path)!, "config.bak.json");
        try
        {
            // A fresh install has no config.json yet: Save(CreateDefault()) in the
            // constructor calls Read() first, so a missing file must not throw.
            if (File.Exists(_path))
            {
                var config = JsonSerializer.Deserialize<AppConfig>(File.ReadAllText(_path), JsonOptions);
                if (config is not null) return config;
            }
        }
        catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException)
        {
            // Fall through to the backup/default path below.
        }

        if (File.Exists(backup))
        {
            try
            {
                return JsonSerializer.Deserialize<AppConfig>(File.ReadAllText(backup), JsonOptions) ?? CreateDefault();
            }
            catch { }
        }
        return CreateDefault();
    }

    public void AddDevice(DeviceConfig device)
    {
        _gate.Wait();
        try
        {
            var current = Read();
            // A re-paired phone keeps one entry (matched by protocol identity).
            var devices = current.Devices.Where(existing => existing.Id != device.Id).ToList();
            devices.Add(device);
            Write(current with { Devices = devices });
        }
        finally { _gate.Release(); }
    }

    public DeviceConfig? FindDeviceById(string id) =>
        Read().Devices.FirstOrDefault(device => device.Id == id);

    public void UpdateDevice(string id, Func<DeviceConfig, DeviceConfig> update)
    {
        _gate.Wait();
        try
        {
            var current = Read();
            var devices = current.Devices.Select(device => device.Id == id ? update(device) : device).ToList();
            Write(current with { Devices = devices });
        }
        finally { _gate.Release(); }
    }

    public void SaveHost(HostConfig host)
    {
        _gate.Wait();
        try
        {
            var current = Read();
            Write(current with { Host = host, Revision = current.Revision + 1 });
        }
        finally { _gate.Release(); }
    }

    public void RegenerateServerId()
    {
        _gate.Wait();
        try
        {
            var current = Read();
            // New identity means v2 phones must pair again; v1 tokens stay valid.
            Write(current with
            {
                Host = current.Host with { ServerId = Guid.NewGuid().ToString("D") },
                Revision = current.Revision + 1,
                Devices = current.Devices.Where(device => device.Protocol == 1).ToList()
            });
        }
        finally { _gate.Release(); }
    }

    public DeviceConfig? FindDeviceByToken(string token)
    {
        var hash = SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token));
        return Read().Devices.FirstOrDefault(device =>
        {
            try
            {
                var storedHash = Convert.FromHexString(device.TokenHash);
                return storedHash.Length == hash.Length && CryptographicOperations.FixedTimeEquals(storedHash, hash);
            }
            catch (FormatException) { return false; }
        });
    }

    public void TouchDevice(string id)
    {
        UpdateDevices(devices => devices.Select(device => device.Id == id ? device with { LastSeen = DateTimeOffset.UtcNow } : device).ToList());
    }

    public bool RevokeDevice(string id)
    {
        var revoked = false;
        UpdateDevices(devices =>
        {
            var remaining = devices.Where(device => device.Id != id).ToList();
            revoked = remaining.Count != devices.Count;
            return remaining;
        });
        return revoked;
    }

    private void UpdateDevices(Func<List<DeviceConfig>, List<DeviceConfig>> update)
    {
        _gate.Wait();
        try
        {
            var current = Read();
            var devices = update(current.Devices);
            Write(current with { Devices = devices });
        }
        finally { _gate.Release(); }
    }

    public void Save(AppConfig config)
    {
        _gate.Wait();
        try
        {
            // configRevision lets a phone skip reloads it does not need.
            var current = Read();
            var revision = Math.Max(current.Revision, config.Revision) + 1;

            // A built-in profile that was present and is gone now was removed on purpose.
            var disabled = (config.DisabledProfiles ?? []).ToList();
            var before = current.Profiles.Select(profile => profile.Id).ToHashSet();
            var after = config.Profiles.Select(profile => profile.Id).ToHashSet();
            foreach (var id in OptionalProfileIds)
            {
                if (before.Contains(id) && !after.Contains(id)) disabled.Add(id);
                else if (after.Contains(id)) disabled.Remove(id);
            }

            var normalized = config with { DisabledProfiles = disabled.Distinct(StringComparer.Ordinal).ToList() };
            Write(WithBuiltIns(normalized) with { Revision = revision });
        }
        finally { _gate.Release(); }
    }

    private void Write(AppConfig config)
    {
        var temp = _path + ".tmp";
        try
        {
            File.WriteAllText(temp, JsonSerializer.Serialize(config, JsonOptions));
            if (File.Exists(_path)) File.Copy(_path, Path.Combine(Path.GetDirectoryName(_path)!, "config.bak.json"), true);
            File.Move(temp, _path, true);
        }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }

    public AppConfig CreateDefault()
    {
        return new AppConfig
        {
            Version = ActionSchemaService.CurrentConfigVersion,
            Server = new ServerConfig(47801, 47800, 1000),
            Host = new HostConfig
            {
                ServerId = Guid.NewGuid().ToString("D"),
                PcName = Environment.MachineName,
                PcColor = "#00FF9C",
                PcIcon = "monitor"
            },
            Devices = [],
            DefaultProfileId = "global",
            Profiles = [
                new ProfileConfig(
                    Id: "global",
                    Name: "Global",
                    Accent: "#00FF9C",
                    Grid: new GridConfig(4, 3),
                    Pages: [
                        new PageConfig("p1", "Principal", [
                            new("b1", "toggle", "Micrófono", new("lucide", "mic-off"), new(0, 0), new("mute.toggle", new() { ["target"] = "mic" }), "mic.muted"),
                            new("b2", "action", "Play / pausa", new("lucide", "play"), new(0, 1), new("media", new() { ["cmd"] = "playpause" })),
                            new("b3", "action", "Anterior", new("lucide", "skip-back"), new(0, 2), new("media", new() { ["cmd"] = "prev" })),
                            new("b4", "action", "Siguiente", new("lucide", "skip-forward"), new(0, 3), new("media", new() { ["cmd"] = "next" })),

                            new("b5", "action", "Captura", new("lucide", "camera"), new(1, 0), new("hotkey", new() { ["keys"] = new[] { "win", "shift", "s" } })),
                            new("b6", "action", "Escritorio", new("lucide", "monitor"), new(1, 1), new("hotkey", new() { ["keys"] = new[] { "win", "d" } })),
                            new("b7", "action", "Admin tareas", new("lucide", "activity"), new(1, 2), new("hotkey", new() { ["keys"] = new[] { "ctrl", "shift", "esc" } })),
                            new("b8", "action", "Bloquear PC", new("lucide", "lock"), new(1, 3), new("power", new() { ["cmd"] = "lock" })),

                            new("b9", "toggle", "Audio", new("lucide", "volume-2"), new(2, 0), new("mute.toggle", new() { ["target"] = "master" }), "audio.muted"),
                            new("b10", "action", "Spotify", new("lucide", "music"), new(2, 1), new("launch", new() { ["path"] = "spotify.exe" })),
                            new("b11", "action", "Salida audio", new("lucide", "headphones"), new(2, 2), new("audio.device", new() { ["flow"] = "output", ["mode"] = "cycle" })),
                            new("b12", "action", "Terminal", new("lucide", "terminal"), new(2, 3), new("launch", new() { ["path"] = "wt.exe" }))
                        ])
                    ]
                ),
                SpotifyProfile(),
                GamerProfile(),
                new ProfileConfig(
                    Id: "vscode",
                    Name: "VS Code",
                    Accent: "#007ACC",
                    Grid: new GridConfig(4, 3),
                    Pages: [
                        new PageConfig("p_vs1", "Code", [
                            new("vs_b1", "action", "Paleta", new("lucide", "terminal"), new(0, 0), new("hotkey", new() { ["keys"] = new[] { "ctrl", "shift", "p" } })),
                            new("vs_b2", "action", "Buscar", new("lucide", "search"), new(0, 1), new("hotkey", new() { ["keys"] = new[] { "ctrl", "shift", "f" } })),
                            new("vs_b3", "action", "Terminal", new("lucide", "terminal"), new(0, 2), new("hotkey", new() { ["keys"] = new[] { "ctrl", "`" } })),
                            new("vs_b4", "action", "Guardar todo", new("lucide", "save"), new(0, 3), new("hotkey", new() { ["keys"] = new[] { "ctrl", "k", "s" } })),

                            new("vs_b5", "action", "Depurar", new("lucide", "play"), new(1, 0), new("hotkey", new() { ["keys"] = new[] { "f5" } })),
                            new("vs_b6", "action", "Paso a paso", new("lucide", "corner-down-right"), new(1, 1), new("hotkey", new() { ["keys"] = new[] { "f10" } })),
                            new("vs_b7", "action", "Detener depurador", new("lucide", "square"), new(1, 2), new("hotkey", new() { ["keys"] = new[] { "shift", "f5" } })),
                            new("vs_b8", "action", "Comentar", new("lucide", "code"), new(1, 3), new("hotkey", new() { ["keys"] = new[] { "ctrl", "/" } })),

                            new("vs_b9", "action", "Git commit", new("lucide", "git-commit"), new(2, 0), new("hotkey", new() { ["keys"] = new[] { "ctrl", "enter" } })),
                            new("vs_b10", "action", "Formatear", new("lucide", "align-left"), new(2, 1), new("hotkey", new() { ["keys"] = new[] { "shift", "alt", "f" } })),
                            new("vs_b11", "action", "Pantalla completa", new("lucide", "maximize"), new(2, 2), new("hotkey", new() { ["keys"] = new[] { "f11" } })),
                            new("vs_b12", "action", "Cerrar pestaña", new("lucide", "x"), new(2, 3), new("hotkey", new() { ["keys"] = new[] { "ctrl", "w" } }))
                        ])
                    ],
                    Match: new MatchConfig(["code.exe"])
                ),
                new ProfileConfig(
                    Id: "chrome",
                    Name: "Google Chrome",
                    Accent: "#4285F4",
                    Grid: new GridConfig(4, 3),
                    Pages: [
                        new PageConfig("p_ch1", "Navegador", [
                            new("ch_b1", "action", "Nueva pestaña", new("lucide", "plus"), new(0, 0), new("browser", new() { ["cmd"] = "tab.new" })),
                            new("ch_b2", "action", "Cerrar pestaña", new("lucide", "x"), new(0, 1), new("browser", new() { ["cmd"] = "tab.close" })),
                            new("ch_b3", "action", "Reabrir", new("lucide", "rotate-ccw"), new(0, 2), new("browser", new() { ["cmd"] = "tab.reopen" })),
                            new("ch_b4", "action", "Recargar", new("lucide", "rotate-cw"), new(0, 3), new("browser", new() { ["cmd"] = "page.reload" })),

                            new("ch_b5", "action", "Pest. anterior", new("lucide", "chevron-left"), new(1, 0), new("browser", new() { ["cmd"] = "tab.prev" })),
                            new("ch_b6", "action", "Pest. siguiente", new("lucide", "chevron-right"), new(1, 1), new("browser", new() { ["cmd"] = "tab.next" })),
                            new("ch_b7", "action", "DevTools", new("lucide", "code"), new(1, 2), new("browser", new() { ["cmd"] = "devtools" })),
                            new("ch_b8", "action", "Marcadores", new("lucide", "bookmark"), new(1, 3), new("browser", new() { ["cmd"] = "bookmark" })),

                            new("ch_b9", "action", "Google", new("lucide", "globe"), new(2, 0), new("url", new() { ["url"] = "https://google.com" })),
                            new("ch_b10", "action", "YouTube", new("lucide", "video"), new(2, 1), new("url", new() { ["url"] = "https://youtube.com" })),
                            new("ch_b11", "action", "Incógnito", new("lucide", "eye-off"), new(2, 2), new("browser", new() { ["cmd"] = "incognito" })),
                            new("ch_b12", "action", "Descargas", new("lucide", "download"), new(2, 3), new("browser", new() { ["cmd"] = "downloads" }))
                        ])
                    ],
                    Match: new MatchConfig(["chrome.exe", "msedge.exe", "brave.exe"])
                )
            ],
            Telemetry = new TelemetryConfig(
                new TelemetrySlots(
                    Left: [
                        new("L1", "dual", "cpu.load", "cpu.temp"),
                        new("L2", "single", "ram.used")
                    ],
                    Right: [
                        new("R1", "single", "ping.app"),
                        new("R2", "dual", "net.down", "net.up")
                    ]
                )
            ),
            Alerts = [
                new("a1", "cpu.temp", ">", 85, true, 30),
                new("a2", "gpu.temp", ">", 85, true, 30)
            ],
            Scripts = []
        };
    }
}

internal sealed record IconConfig(string Kind, string Value, string? Source = null);

internal sealed class IconConfigConverter : JsonConverter<IconConfig>
{
    public override IconConfig? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
        {
            var val = reader.GetString() ?? "";
            return new IconConfig("lucide", val);
        }
        if (reader.TokenType == JsonTokenType.StartObject)
        {
            using var doc = JsonDocument.ParseValue(ref reader);
            var kind = doc.RootElement.TryGetProperty("kind", out var k) ? k.GetString() ?? "lucide" : "lucide";
            var val = doc.RootElement.TryGetProperty("value", out var v) ? v.GetString() ?? "" : "";
            var source = doc.RootElement.TryGetProperty("source", out var s) ? s.GetString() : null;
            return new IconConfig(kind, val, string.IsNullOrWhiteSpace(source) ? null : source);
        }
        return new IconConfig("lucide", "circle");
    }

    public override void Write(Utf8JsonWriter writer, IconConfig value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        writer.WriteString("kind", value.Kind);
        writer.WriteString("value", value.Value);
        if (!string.IsNullOrWhiteSpace(value.Source)) writer.WriteString("source", value.Source);
        writer.WriteEndObject();
    }
}

internal sealed record PositionConfig(int Row, int Col, int RowSpan = 1, int ColSpan = 1);

internal sealed record ActionConfig(string Kind, Dictionary<string, object?>? Params = null);

internal sealed record ButtonConfig(
    string Id,
    string Type,
    string Label,
    IconConfig Icon,
    PositionConfig Pos,
    ActionConfig? Action = null,
    string? StateBinding = null,
    string? FolderPageId = null
);

internal sealed record GridConfig(int Cols, int Rows);

internal sealed record PageConfig(string Id, string Name, List<ButtonConfig> Buttons);

internal sealed record MatchConfig(List<string> Processes);

internal sealed record ProfileConfig(
    string Id,
    string Name,
    string Accent,
    GridConfig Grid,
    List<PageConfig> Pages,
    MatchConfig? Match = null,
    GridConfig? GridPortrait = null
);

internal sealed record TelemetrySlot(string Id, string Widget, string Primary, string? Secondary = null);

internal sealed record TelemetrySlots(List<TelemetrySlot> Left, List<TelemetrySlot> Right);

internal sealed record TelemetryConfig(TelemetrySlots Slots);

internal sealed class TelemetryConfigConverter : JsonConverter<TelemetryConfig>
{
    public override TelemetryConfig? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader);
        var root = doc.RootElement;
        if (root.TryGetProperty("slots", out var slotsElement))
        {
            if (slotsElement.TryGetProperty("left", out var leftArr) && slotsElement.TryGetProperty("right", out var rightArr))
            {
                var left = JsonSerializer.Deserialize<List<TelemetrySlot>>(leftArr.GetRawText(), options) ?? [];
                var right = JsonSerializer.Deserialize<List<TelemetrySlot>>(rightArr.GetRawText(), options) ?? [];
                return new TelemetryConfig(new TelemetrySlots(left, right));
            }
        }
        return new TelemetryConfig(new TelemetrySlots(
            Left: [
                new("L1", "dual", "cpu.load", "cpu.temp"),
                new("L2", "single", "ram.used")
            ],
            Right: [
                new("R1", "single", "ping.app"),
                new("R2", "dual", "net.down", "net.up")
            ]
        ));
    }

    public override void Write(Utf8JsonWriter writer, TelemetryConfig value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        writer.WritePropertyName("slots");
        writer.WriteStartObject();
        writer.WritePropertyName("left");
        JsonSerializer.Serialize(writer, value.Slots.Left, options);
        writer.WritePropertyName("right");
        JsonSerializer.Serialize(writer, value.Slots.Right, options);
        writer.WriteEndObject();
        writer.WriteEndObject();
    }
}

internal sealed record AlertConfig(string Id, string Metric, string Op, double Value, bool Vibrate = true, int CooldownSec = 30);

internal sealed record ScriptConfig(string Id, string Name, string File);

internal sealed record ServerConfig(int HttpPort = 47801, int HttpsPort = 47800, int TelemetryIntervalMs = 1000);

/// <summary>
/// Stable identity of this PC plus the optional USB and wake-on-LAN settings.
/// </summary>
internal sealed record HostConfig
{
    public string ServerId { get; init; } = "";
    public string? PcName { get; init; }
    public string PcColor { get; init; } = "#00FF9C";
    public string PcIcon { get; init; } = "monitor";
    public bool UsbEnabled { get; init; }
    public string? AdbPath { get; init; }
    public List<string> ApprovedUsbSerials { get; init; } = [];
    public bool WolEnabled { get; init; } = true;
    public int WolPort { get; init; } = 9;
}

/// <summary>
/// A paired phone. v1 devices authenticate with a token hash; v2 devices keep
/// their key protected with DPAPI (protocol 2).
/// </summary>
internal sealed record DeviceConfig(
    string Id,
    string Name,
    string TokenHash,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastSeen = null,
    string? DeviceKeyProtected = null,
    int Protocol = 1,
    string? Transport = null,
    string? Platform = null);

internal sealed record AppConfig
{
    public int Version { get; init; } = 1;
    public ServerConfig Server { get; init; } = new();
    public HostConfig Host { get; init; } = new();
    public int Revision { get; init; } = 1;
    public List<DeviceConfig> Devices { get; init; } = [];
    public string DefaultProfileId { get; init; } = "global";
    public List<ProfileConfig> Profiles { get; init; } = [];
    public TelemetryConfig Telemetry { get; init; } = new(new(
        [new("L1", "dual", "cpu.load", "cpu.temp"), new("L2", "single", "ram.used")],
        [new("R1", "single", "ping.app"), new("R2", "dual", "net.down", "net.up")]
    ));
    public List<AlertConfig> Alerts { get; init; } = [];
    public List<ScriptConfig> Scripts { get; init; } = [];
    /// <summary>Ids of the optional built-in profiles the user chose to remove.</summary>
    public List<string> DisabledProfiles { get; init; } = [];
}
