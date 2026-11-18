using NexoDeck.Server.Hosting;
using NexoDeck.Server.Services;
using NexoDeck.Server.Tray;
using System.Threading;
using System.Windows.Forms;

namespace NexoDeck.Server;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        // Protocol v2 vectors: used by CI and by both sides of the wire protocol.
        var verifyIndex = Array.IndexOf(args, "--verify-v2");
        if (verifyIndex >= 0)
        {
            var path = args.Length > verifyIndex + 1 ? args[verifyIndex + 1] : "docs/protocol-v2-vectors.json";
            Environment.ExitCode = ProtocolSelfTest.Run(path);
            return;
        }

        ApplicationConfiguration.Initialize();
        var dataDir = DataDirectory.Resolve(args);
        Directory.CreateDirectory(dataDir);

        try
        {
            using var response = LocalServer.TryShowExistingWindowAsync().GetAwaiter().GetResult();
            if (response is not null) return;
        }
        catch { }

        using var server = new LocalServer(dataDir);
        server.StartAsync().GetAwaiter().GetResult();

        var isBackground = args.Contains("--background", StringComparer.OrdinalIgnoreCase);
        Application.Run(new TrayApplicationContext(server, dataDir, isBackground));

        try
        {
            server.StopAsync().GetAwaiter().GetResult();
        }
        catch { }
    }
}
