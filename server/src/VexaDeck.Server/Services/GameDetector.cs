using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace VexaDeck.Server.Services;

/// <summary>
/// Decides whether the foreground app looks like a game. Two signals are used:
/// the executable lives inside a known game library (Steam, Epic, D:\Games, ...)
/// or Windows reports a fullscreen Direct3D app. Launchers, browsers and video
/// players are ignored so they never trigger the Gamer profile.
/// </summary>
internal sealed partial class GameDetector
{
    [DllImport("shell32.dll")]
    private static extern int SHQueryUserNotificationState(out int state);

    private const int QunsBusy = 2;
    private const int QunsRunningD3DFullScreen = 3;

    private static readonly HashSet<string> IgnoredProcesses = new(StringComparer.OrdinalIgnoreCase)
    {
        "explorer.exe", "applicationframehost.exe", "searchhost.exe", "startmenuexperiencehost.exe",
        "chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe", "vivaldi.exe",
        "vlc.exe", "mpv.exe", "mpc-hc64.exe", "wmplayer.exe", "spotify.exe", "discord.exe",
        "steam.exe", "steamwebhelper.exe", "epicgameslauncher.exe", "sklauncher.exe",
        "vexadeck.server.exe", "teams.exe", "zoom.exe", "code.exe"
    };

    private static readonly string[] DefaultFolders =
    [
        @"D:\Games", @"C:\Games", @"D:\Juegos", @"C:\Juegos"
    ];

    private readonly object _lock = new();
    private List<string> _folders = [];
    private DateTimeOffset _refreshed = DateTimeOffset.MinValue;

    public bool IsGame(string processName, string? fullPath)
    {
        if (string.IsNullOrWhiteSpace(processName)) return false;

        var name = Path.GetFileName(processName);
        if (IgnoredProcesses.Contains(name)) return false;

        if (!string.IsNullOrWhiteSpace(fullPath) && IsInGameFolder(fullPath)) return true;

        return IsFullscreenApp();
    }

    private bool IsInGameFolder(string fullPath)
    {
        var normalized = fullPath.Replace('/', '\\');
        foreach (var folder in Folders())
        {
            if (normalized.StartsWith(folder + "\\", StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    /// <summary>Game library roots, refreshed every five minutes so new installs are picked up.</summary>
    private List<string> Folders()
    {
        lock (_lock)
        {
            if (DateTimeOffset.UtcNow - _refreshed < TimeSpan.FromMinutes(5)) return _folders;

            var folders = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var folder in DefaultFolders) AddIfExists(folders, folder);
            AddIfExists(folders, Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Games"));
            AddSteamLibraries(folders);
            AddEpicLibraries(folders);

            _folders = folders.Select(folder => folder.TrimEnd('\\')).ToList();
            _refreshed = DateTimeOffset.UtcNow;
            return _folders;
        }
    }

    private static void AddIfExists(HashSet<string> folders, string path)
    {
        try
        {
            if (Directory.Exists(path)) folders.Add(Path.GetFullPath(path));
        }
        catch { }
    }

    private static void AddSteamLibraries(HashSet<string> folders)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam");
            var steamPath = key?.GetValue("SteamPath") as string;
            if (string.IsNullOrWhiteSpace(steamPath)) return;

            AddIfExists(folders, Path.Combine(steamPath, "steamapps", "common"));

            // Extra libraries live in libraryfolders.vdf ("path" "D:\\SteamLibrary").
            var vdf = Path.Combine(steamPath, "steamapps", "libraryfolders.vdf");
            if (!File.Exists(vdf)) return;

            foreach (Match match in SteamLibraryRegex().Matches(File.ReadAllText(vdf)))
            {
                var library = match.Groups[1].Value.Replace(@"\\", @"\");
                AddIfExists(folders, Path.Combine(library, "steamapps", "common"));
            }
        }
        catch { }
    }

    private static void AddEpicLibraries(HashSet<string> folders)
    {
        try
        {
            var manifest = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "Epic", "UnrealEngineLauncher", "LauncherInstalled.dat");
            if (!File.Exists(manifest)) return;

            using var document = JsonDocument.Parse(File.ReadAllText(manifest));
            if (!document.RootElement.TryGetProperty("InstallationList", out var installs)) return;
            foreach (var install in installs.EnumerateArray())
            {
                if (install.TryGetProperty("InstallLocation", out var location))
                {
                    var path = location.GetString();
                    if (!string.IsNullOrWhiteSpace(path)) AddIfExists(folders, path!);
                }
            }
        }
        catch { }
    }

    private static bool IsFullscreenApp()
    {
        try
        {
            if (SHQueryUserNotificationState(out var state) != 0) return false;
            return state is QunsRunningD3DFullScreen or QunsBusy;
        }
        catch
        {
            return false;
        }
    }

    [GeneratedRegex("\"path\"\\s+\"([^\"]+)\"")]
    private static partial Regex SteamLibraryRegex();
}
