namespace OpenDeck.Server.Services;

internal sealed record AppCatalogEntry(string Name, string Launch, string Source, string? Aumid = null, string? Icon = null);

/// <summary>Installed applications from the Start Menu and the Store (shell:AppsFolder).</summary>
internal sealed class AppCatalogService
{
    private readonly object _lock = new();
    private List<AppCatalogEntry>? _cache;
    private DateTimeOffset _cachedAt;

    public IReadOnlyList<AppCatalogEntry> GetInstalled()
    {
        lock (_lock)
        {
            if (_cache is not null && DateTimeOffset.UtcNow - _cachedAt < TimeSpan.FromMinutes(5))
            {
                return _cache;
            }

            var entries = new List<AppCatalogEntry>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            AddStartMenu(Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu), entries, seen);
            AddStartMenu(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), entries, seen);
            AddStoreApps(entries, seen);

            _cache = entries.OrderBy(entry => entry.Name, StringComparer.CurrentCultureIgnoreCase).ToList();
            _cachedAt = DateTimeOffset.UtcNow;
            return _cache;
        }
    }

    private static void AddStartMenu(string root, List<AppCatalogEntry> entries, HashSet<string> seen)
    {
        if (string.IsNullOrWhiteSpace(root)) return;
        var programs = Path.Combine(root, "Programs");
        if (!Directory.Exists(programs)) return;

        IEnumerable<string> files;
        try { files = Directory.EnumerateFiles(programs, "*.lnk", SearchOption.AllDirectories); }
        catch { return; }

        foreach (var file in files)
        {
            try
            {
                var name = Path.GetFileNameWithoutExtension(file);
                if (string.IsNullOrWhiteSpace(name)) continue;
                var lowered = name.ToLowerInvariant();
                if (lowered.Contains("uninstall") || lowered.Contains("desinstalar") || lowered.Contains("readme")) continue;
                if (!seen.Add(name)) continue;
                entries.Add(new AppCatalogEntry(name, file, "startmenu"));
            }
            catch { }
        }
    }

    private static void AddStoreApps(List<AppCatalogEntry> entries, HashSet<string> seen)
    {
        try
        {
            var shellType = Type.GetTypeFromProgID("Shell.Application");
            if (shellType is null) return;
            dynamic shell = Activator.CreateInstance(shellType)!;
            dynamic? folder = shell.NameSpace("shell:AppsFolder");
            if (folder is null) return;

            dynamic? items = folder.Items();
            if (items is null) return;
            var count = (int)items.Count;

            for (var i = 0; i < count; i++)
            {
                try
                {
                    dynamic item = items.Item(i);
                    if (item is null) continue;
                    if ((bool)item.IsFolder) continue;
                    var name = (string?)item.Name;
                    var aumid = (string?)item.Path;
                    if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(aumid)) continue;
                    if (!aumid.Contains('!')) continue;
                    var key = name.ToLowerInvariant();
                    if (!seen.Add(key)) continue;
                    entries.Add(new AppCatalogEntry(name, $"shell:AppsFolder\\{aumid}", "store", aumid));
                }
                catch { }
            }
        }
        catch (Exception ex)
        {
            AppLog.Warn($"Could not enumerate shell:AppsFolder: {ex.Message}");
        }
    }
}
