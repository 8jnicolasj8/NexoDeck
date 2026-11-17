using OpenDeck.Server.Hosting;
using OpenDeck.Server.Window;
using System.Windows.Forms;

namespace OpenDeck.Server.Tray;

internal sealed class TrayApplicationContext : ApplicationContext
{
    private readonly NotifyIcon _tray;
    private readonly MainForm _window;
    private readonly LocalServer _server;
    private bool _firstHide = true;
    public static TrayApplicationContext? Current { get; private set; }

    public TrayApplicationContext(LocalServer server, string dataDir, bool background)
    {
        Current = this;
        _server = server;
        _window = new MainForm(dataDir);
        var menu = new ContextMenuStrip();
        menu.Items.Add("Abrir OpenDeck", null, (_, _) => ShowWindow());
        menu.Items.Add("Emparejar celular (QR)", null, (_, _) => ShowWindow());
        menu.Items.Add("Dispositivos", null, (_, _) => ShowWindow());
        menu.Items.Add("Pausar servidor", null, (_, _) => MessageBox.Show("La pausa del servidor estará disponible en una próxima etapa.", "OpenDeck"));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Salir", null, (_, _) => Exit());
        _tray = new NotifyIcon { Text = "OpenDeck", Icon = AppIconHelper.GetAppIcon(), ContextMenuStrip = menu, Visible = true };
        _tray.DoubleClick += (_, _) => ShowWindow();
        _window.FormClosing += (_, e) =>
        {
            if (_window.Exiting) return;
            e.Cancel = true;
            // Closing to the tray destroys WebView2: that is the biggest RAM win (E1).
            _window.HideToTray();
            if (_firstHide) { _tray.ShowBalloonTip(2500, "OpenDeck", "OpenDeck sigue funcionando en segundo plano.", ToolTipIcon.Info); _firstHide = false; }
        };
        if (!background) ShowWindow();
    }

    public void ShowWindow() { if (_window.IsDisposed) return; _window.RestoreFromTray(); }
    private void Exit() { _window.Exiting = true; _tray.Visible = false; _window.Close(); ExitThread(); }
    protected override void Dispose(bool disposing) { if (disposing) { _tray.Dispose(); Current = null; } base.Dispose(disposing); }
}
