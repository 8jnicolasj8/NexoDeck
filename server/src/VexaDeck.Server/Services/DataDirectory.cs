using System.Text.Json;

namespace VexaDeck.Server.Services;

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

        var appData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "VexaDeck");
        var legacyAppData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "NexoDeck");

        var bootstrapPath = Path.Combine(appData, "bootstrap.json");
        var configured = ReadDataDir(bootstrapPath);

        if (configured is null)
        {
            // Primera ejecución de VexaDeck: reutilizamos la carpeta personalizada
            // de NexoDeck si existía, o migramos la carpeta estándar.
            var legacyConfigured = ReadDataDir(Path.Combine(legacyAppData, "bootstrap.json"));
            configured = legacyConfigured is not null && !SamePath(legacyConfigured, legacyAppData)
                ? legacyConfigured
                : appData;

            MigrateLegacyData(legacyAppData, configured);
            WriteBootstrap(appData, configured);
        }
        else
        {
            MigrateLegacyData(legacyAppData, configured);
        }

        return Path.GetFullPath(configured);
    }

    private static string? ReadDataDir(string path)
    {
        if (!File.Exists(path)) return null;
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            var configured = document.RootElement.GetProperty("dataDir").GetString();
            return string.IsNullOrWhiteSpace(configured) ? null : Path.GetFullPath(configured);
        }
        catch (JsonException) { return null; }
        catch (KeyNotFoundException) { return null; }
    }

    private static void WriteBootstrap(string appData, string dataDir)
    {
        try
        {
            Directory.CreateDirectory(appData);
            var json = JsonSerializer.Serialize(new { dataDir });
            File.WriteAllText(Path.Combine(appData, "bootstrap.json"), json);
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }

    /// <summary>
    /// Copia configuración, perfiles, scripts e íconos de la etapa NexoDeck.
    /// No copia certificados ni logs: la CA nueva se genera con la identidad VexaDeck.
    /// </summary>
    private static void MigrateLegacyData(string legacy, string target)
    {
        if (SamePath(legacy, target)) return;
        if (!Directory.Exists(legacy)) return;
        if (File.Exists(Path.Combine(target, "config.json"))) return;
        if (!File.Exists(Path.Combine(legacy, "config.json"))) return;

        try
        {
            Directory.CreateDirectory(target);

            foreach (var directory in Directory.EnumerateDirectories(legacy))
            {
                var name = Path.GetFileName(directory);
                if (name.Equals("certs", StringComparison.OrdinalIgnoreCase) ||
                    name.Equals("logs", StringComparison.OrdinalIgnoreCase))
                    continue;
                CopyDirectory(directory, Path.Combine(target, name));
            }

            foreach (var file in Directory.EnumerateFiles(legacy))
            {
                var name = Path.GetFileName(file);
                if (name.Equals("bootstrap.json", StringComparison.OrdinalIgnoreCase)) continue;
                var destination = Path.Combine(target, name);
                if (!File.Exists(destination)) File.Copy(file, destination);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Una copia parcial no rompe nada: el próximo arranque completa lo que falte.
        }
    }

    private static void CopyDirectory(string source, string destination)
    {
        Directory.CreateDirectory(destination);
        foreach (var file in Directory.EnumerateFiles(source))
        {
            var target = Path.Combine(destination, Path.GetFileName(file));
            if (!File.Exists(target)) File.Copy(file, target);
        }
        foreach (var directory in Directory.EnumerateDirectories(source))
            CopyDirectory(directory, Path.Combine(destination, Path.GetFileName(directory)));
    }

    private static bool SamePath(string left, string right) =>
        string.Equals(
            Path.GetFullPath(left).TrimEnd(Path.DirectorySeparatorChar),
            Path.GetFullPath(right).TrimEnd(Path.DirectorySeparatorChar),
            StringComparison.OrdinalIgnoreCase);
}
