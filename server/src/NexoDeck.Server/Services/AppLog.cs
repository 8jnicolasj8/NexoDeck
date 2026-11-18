namespace NexoDeck.Server.Services;

/// <summary>Append-only disk log with size rotation. Nothing is kept in memory.</summary>
internal static class AppLog
{
    private static readonly object Gate = new();
    private static string _directory = "";

    public static void Init(string dataDir)
    {
        _directory = Path.Combine(dataDir, "logs");
        Directory.CreateDirectory(_directory);
    }

    public static void Info(string message) => Write("INFO", message);
    public static void Warn(string message) => Write("WARN", message);

    private static void Write(string level, string message)
    {
        if (string.IsNullOrEmpty(_directory)) return;
        lock (Gate)
        {
            try
            {
                var path = Path.Combine(_directory, "nexodeck.log");
                var info = new FileInfo(path);
                if (info.Exists && info.Length > 1024 * 1024)
                {
                    var previous = Path.Combine(_directory, "nexodeck.1.log");
                    File.Copy(path, previous, true);
                    File.WriteAllText(path, "");
                }
                File.AppendAllText(path, $"{DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss.fff} [{level}] {message}{Environment.NewLine}");
            }
            catch { }
        }
    }
}
