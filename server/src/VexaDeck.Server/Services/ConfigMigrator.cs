using System.Text.Json;

namespace VexaDeck.Server.Services;

/// <summary>
/// Converts v0.1 configuration (version 1) into the v0.2 shape (version 2).
/// Unknown action kinds and parameters are preserved instead of dropped.
/// </summary>
internal static class ConfigMigrator
{
    public static AppConfig Migrate(AppConfig config, ActionSchemaService schemas)
    {
        if (config.Version >= ActionSchemaService.CurrentConfigVersion) return config;

        var profiles = config.Version < 2
            ? config.Profiles.Select(profile => profile with
              {
                  Pages = profile.Pages.Select(page => page with
                  {
                      Buttons = page.Buttons.Select(button => MigrateButton(button, schemas)).ToList()
                  }).ToList()
              }).ToList()
            : config.Profiles;

        // v3 adds the PC identity, client revision and v2 device fields.
        var host = config.Host;
        if (string.IsNullOrWhiteSpace(host.ServerId)) host = host with { ServerId = Guid.NewGuid().ToString("D") };
        if (string.IsNullOrWhiteSpace(host.PcName)) host = host with { PcName = Environment.MachineName };
        if (string.IsNullOrWhiteSpace(host.PcColor)) host = host with { PcColor = "#00FF9C" };

        return config with
        {
            Version = ActionSchemaService.CurrentConfigVersion,
            Host = host,
            Revision = Math.Max(1, config.Revision),
            Profiles = profiles
        };
    }

    private static ButtonConfig MigrateButton(ButtonConfig button, ActionSchemaService schemas)
    {
        if (button.Action is null) return button;

        var legacyKind = button.Action.Kind;
        var kind = NormalizeKind(legacyKind);
        var parameters = NormalizeParams(kind, button.Action.Params, legacyKind);

        var derived = schemas.DeriveStateBinding(kind, parameters);
        var stateBinding = derived ?? button.StateBinding;

        var type = button.Type;
        if (kind == "volume.master") type = "slider";
        if (type == "toggle" && string.IsNullOrEmpty(stateBinding)) type = "action";

        // v0.1 buttons could omit "icon" entirely; JSON leaves the record property null.
        var icon = button.Icon ?? new IconConfig("auto", "auto");
        var launchPath = kind == "launch" ? ParamReader.GetString(parameters, "path") : null;
        if (!string.IsNullOrWhiteSpace(launchPath))
        {
            // v0.1 used a generic icon; v0.2 resolves the real app logo on startup.
            icon = new IconConfig("auto", "", launchPath);
        }

        return button with
        {
            Type = type,
            Icon = icon,
            Action = new ActionConfig(kind, parameters),
            StateBinding = string.IsNullOrEmpty(stateBinding) ? null : stateBinding
        };
    }

    private static string NormalizeKind(string kind) => kind switch
    {
        "text" or "type" => "text.type",
        "script" => "script.run",
        "open_url" or "url.open" => "url",
        "chrome" => "browser",
        "audio.mute" or "output.mute" => "mute.toggle",
        "mic.mute" or "microphone.mute" => "mute.toggle",
        "audio.deviceCycle" or "audio.cycle" => "audio.device",
        "volume" => "volume.master",
        _ => kind
    };

    private static Dictionary<string, object?> NormalizeParams(string kind, Dictionary<string, object?>? source, string? legacyKind = null)
    {
        var p = source is null ? new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase) : new(source, StringComparer.OrdinalIgnoreCase);
        var result = new Dictionary<string, object?>();

        void Keep(string key, object? value)
        {
            if (value is null) return;
            if (value is string s && string.IsNullOrWhiteSpace(s)) return;
            result[key] = value;
        }

        switch (kind)
        {
            case "hotkey":
                Keep("keys", ParamReader.GetStringList(p, "keys"));
                break;

            case "text.type":
                Keep("text", ParamReader.GetString(p, "text") ?? ParamReader.GetString(p, "value"));
                break;

            case "media":
                Keep("cmd", NormalizeMedia(ParamReader.GetString(p, "cmd") ?? ParamReader.GetString(p, "target") ?? ParamReader.GetString(p, "action")));
                break;

            case "volume.master":
                // v0.1 accepted a delta/level; v0.2 drives it from the slider.
                break;

            case "volume.app":
                Keep("process", ParamReader.GetString(p, "process") ?? ParamReader.GetString(p, "app"));
                break;

            case "mute.toggle":
                var target = (ParamReader.GetString(p, "target") ?? "").ToLowerInvariant();
                if (target is "microphone" or "micro") target = "mic";
                else if (target is "output" or "speakers" or "speaker" or "playback") target = "master";
                else if (target.Length == 0)
                {
                    // v0.1 had dedicated mic.* kinds; keep the microphone intent after remapping.
                    target = (legacyKind ?? "").StartsWith("mic", StringComparison.OrdinalIgnoreCase) ? "mic" : "master";
                }
                result["target"] = target;
                if (target == "app")
                {
                    Keep("process", ParamReader.GetString(p, "process") ?? ParamReader.GetString(p, "app"));
                }
                break;

            case "audio.device":
                var flow = (ParamReader.GetString(p, "flow") ?? "output").ToLowerInvariant();
                result["flow"] = flow == "input" || flow == "capture" ? "input" : "output";

                var explicitMode = ParamReader.GetString(p, "mode")?.ToLowerInvariant();
                var deviceId = ParamReader.GetString(p, "deviceId") ?? ParamReader.GetString(p, "device");
                var cycleValue = ParamReader.Get(p, "cycle");
                var cycle = cycleValue switch
                {
                    bool b => b,
                    string s => s.Equals("true", StringComparison.OrdinalIgnoreCase) || s == "cycle",
                    JsonElement { ValueKind: JsonValueKind.True } => true,
                    JsonElement { ValueKind: JsonValueKind.String } e => string.Equals(e.GetString(), "true", StringComparison.OrdinalIgnoreCase),
                    null => string.IsNullOrWhiteSpace(deviceId),
                    _ => false
                };

                var mode = explicitMode ?? (cycle ? "cycle" : "specific");
                result["mode"] = mode == "specific" || mode == "device" ? "specific" : "cycle";
                if (result["mode"] is "specific")
                {
                    Keep("deviceId", deviceId);
                }
                else
                {
                    var devices = ParamReader.GetStringList(p, "devices");
                    Keep("devices", devices);
                }
                break;

            case "launch":
                Keep("path", ParamReader.GetString(p, "path") ?? ParamReader.GetString(p, "app") ?? ParamReader.GetString(p, "target"));
                Keep("args", ParamReader.GetString(p, "args"));
                break;

            case "script.run":
                Keep("file", ParamReader.GetString(p, "file") ?? ParamReader.GetString(p, "id"));
                break;

            case "power":
                var cmd = (ParamReader.GetString(p, "cmd") ?? "lock").ToLowerInvariant();
                result["cmd"] = cmd switch
                {
                    "apagar" or "poweroff" => "shutdown",
                    "reiniciar" or "reboot" => "restart",
                    "suspender" or "hibernate" or "suspend" => "sleep",
                    "bloquear" => "lock",
                    _ => cmd
                };
                if (ParamReader.GetBool(p, "confirmed"))
                {
                    result["confirmed"] = true;
                }
                break;

            case "url":
                Keep("url", ParamReader.GetString(p, "url") ?? ParamReader.GetString(p, "path") ?? ParamReader.GetString(p, "value"));
                break;

            case "browser":
                Keep("cmd", NormalizeBrowser(ParamReader.GetString(p, "cmd") ?? ParamReader.GetString(p, "action")));
                break;

            case "folder.open":
                Keep("pageId", ParamReader.GetString(p, "pageId") ?? ParamReader.GetString(p, "folderPageId"));
                break;

            case "profile.pin":
                var profileId = ParamReader.GetString(p, "profileId");
                if (!string.IsNullOrWhiteSpace(profileId) && profileId != "auto") result["profileId"] = profileId;
                break;

            case "clipboard.snippet":
                Keep("text", ParamReader.GetString(p, "text"));
                result["restore"] = ParamReader.GetBool(p, "restore", true);
                result["pressEnter"] = ParamReader.GetBool(p, "pressEnter");
                break;

            default:
                // Unknown/legacy kind: keep every parameter untouched.
                foreach (var (key, value) in p)
                {
                    if (value is not null) result[key] = value;
                }
                break;
        }

        return result;
    }

    private static string NormalizeMedia(string? cmd) => (cmd ?? "").ToLowerInvariant() switch
    {
        "toggle" or "play/pause" or "play-pause" or "" => "playpause",
        "previous" or "track.previous" => "prev",
        "nexttrack" or "track.next" => "next",
        "volumeup" or "volume.up" => "volup",
        "volumedown" or "volume.down" => "voldown",
        "unmute" or "muteall" => "mute",
        var other => other
    };

    private static string NormalizeBrowser(string? cmd) => (cmd ?? "").ToLowerInvariant() switch
    {
        "new_tab" => "tab.new",
        "close_tab" => "tab.close",
        "reopen_tab" => "tab.reopen",
        "next_tab" => "tab.next",
        "prev_tab" => "tab.prev",
        "reload" => "page.reload",
        "hard_reload" => "page.hard_reload",
        "inspect" => "devtools",
        "new_window" => "window.new",
        "" => "tab.new",
        var other => other
    };
}
