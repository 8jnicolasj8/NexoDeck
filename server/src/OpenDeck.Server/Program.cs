using OpenDeck.Server.Hosting;
using OpenDeck.Server.Services;
using OpenDeck.Server.Tray;
using System.Threading;
using System.Windows.Forms;

namespace OpenDeck.Server;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
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
