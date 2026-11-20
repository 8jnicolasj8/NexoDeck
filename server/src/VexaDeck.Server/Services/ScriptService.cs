using System.Diagnostics;

namespace VexaDeck.Server.Services;

internal sealed class ScriptService
{
    private readonly string _scriptsDir;
    private readonly ConfigService _config;

    public ScriptService(string dataDir, ConfigService config)
    {
        _scriptsDir = Path.GetFullPath(Path.Combine(dataDir, "scripts"));
        _config = config;
        Directory.CreateDirectory(_scriptsDir);
    }

    public string ScriptsDirectory => _scriptsDir;

    public bool ExecuteScript(string scriptId)
    {
        var cfg = _config.Read();
        var script = cfg.Scripts.FirstOrDefault(s => s.Id == scriptId || s.File.Equals(scriptId, StringComparison.OrdinalIgnoreCase));
        if (script is null) return false;

        return RunFile(script.File);
    }

    public bool RunFile(string relativeOrFileName)
    {
        if (string.IsNullOrWhiteSpace(relativeOrFileName)) return false;

        // Anti path-traversal check
        var candidatePath = Path.GetFullPath(Path.Combine(_scriptsDir, relativeOrFileName));
        var dirWithSep = _scriptsDir.EndsWith(Path.DirectorySeparatorChar)
            ? _scriptsDir
            : _scriptsDir + Path.DirectorySeparatorChar;

        if (!candidatePath.StartsWith(dirWithSep, StringComparison.OrdinalIgnoreCase))
        {
            // Path traversal attempted!
            return false;
        }

        if (!File.Exists(candidatePath)) return false;

        var ext = Path.GetExtension(candidatePath).ToLowerInvariant();
        if (ext != ".vbs")
        {
            // Whitelist: only .vbs allowed by default
            return false;
        }

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "wscript.exe",
                Arguments = $"\"{candidatePath}\"",
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = _scriptsDir
            };
            using var proc = Process.Start(psi);
            return proc is not null;
        }
        catch
        {
            return false;
        }
    }
}
