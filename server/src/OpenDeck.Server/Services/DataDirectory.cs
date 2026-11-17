using System.Text.Json;

namespace OpenDeck.Server.Services;

internal static class DataDirectory
{
    public static string Resolve(string[] args)
    {
        for (var i = 0; i < args.Length - 1; i++)
            if (args[i].Equals("--data-dir", StringComparison.OrdinalIgnoreCase))
                return Path.GetFullPath(args[i + 1]);

        var executableDir = AppContext.BaseDirectory;
        if (File.Exists(Path.Combine(executableDir, "portable.flag")))
            return Path.Combine(executableDir, "data");

        var appData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "OpenDeck");
        var bootstrap = Path.Combine(appData, "bootstrap.json");
        if (File.Exists(bootstrap))
        {
            try
            {
                using var document = JsonDocument.Parse(File.ReadAllText(bootstrap));
                var configured = document.RootElement.GetProperty("dataDir").GetString();
                if (!string.IsNullOrWhiteSpace(configured)) return Path.GetFullPath(configured);
            }
            catch (JsonException) { }
            catch (KeyNotFoundException) { }
        }
        return appData;
    }
}
