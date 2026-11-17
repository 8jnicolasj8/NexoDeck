using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using OpenDeck.Server.Services;

namespace OpenDeck.Server.Window;

internal sealed class MainForm : Form
{
    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

    private const int DWMWA_USE_IMMERSIVE_DARK_MODE_BEFORE_20H1 = 19;
    private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentProcess();

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetProcessWorkingSetSize(IntPtr process, IntPtr minimumWorkingSetSize, IntPtr maximumWorkingSetSize);

    private readonly string _dataDir;
    private readonly System.Windows.Forms.Timer _suspendTimer;
    private WebView2? _browser;
    private bool _initialized;
    private bool _initializing;
    private bool _suspended;
    private readonly Panel _statusPanel;
    private readonly Label _statusTitle;
    private readonly Label _statusMessage;
    private readonly Button _btnOpenBrowser;
    private readonly Button _btnRetry;
    private readonly LinkLabel _linkDownloadRuntime;
    private bool _autoOpenedBrowser;

    public bool Exiting { get; set; }

    public MainForm(string dataDir)
    {
        _dataDir = dataDir;
        Text = "OpenDeck";
        Icon = AppIconHelper.GetAppIcon();
        BackColor = Color.FromArgb(12, 15, 20);
        ForeColor = Color.FromArgb(243, 244, 246);
        MinimumSize = new Size(960, 640);
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1180, 780);

        // Apply dark mode title bar if supported on Windows 10/11
        EnableDarkMode(Handle);

        _suspendTimer = new System.Windows.Forms.Timer { Interval = 30_000 };
        _suspendTimer.Tick += async (_, _) =>
        {
            _suspendTimer.Stop();
            await SuspendBrowserAsync();
        };
        Resize += OnWindowResize;

        EnsureBrowserControl();

        // Status / Fallback UI panel
        _statusPanel = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.FromArgb(12, 15, 20),
            Visible = true
        };

        var container = new TableLayoutPanel
        {
            ColumnCount = 1,
            RowCount = 5,
            AutoSize = true,
            Anchor = AnchorStyles.None,
            Width = 520,
            BackColor = Color.Transparent
        };

        _statusTitle = new Label
        {
            Text = "OpenDeck",
            Font = new Font("Segoe UI", 24, FontStyle.Bold),
            ForeColor = Color.FromArgb(0, 229, 255),
            TextAlign = ContentAlignment.MiddleCenter,
            Dock = DockStyle.Top,
            Height = 48,
            AutoSize = false
        };

        _statusMessage = new Label
        {
            Text = "Iniciando panel de control...",
            Font = new Font("Segoe UI", 11, FontStyle.Regular),
            ForeColor = Color.FromArgb(156, 163, 175),
            TextAlign = ContentAlignment.MiddleCenter,
            Dock = DockStyle.Top,
            Height = 60,
            AutoSize = false
        };

        _btnOpenBrowser = new Button
        {
            Text = "Abrir panel en el navegador web",
            Font = new Font("Segoe UI", 11, FontStyle.Bold),
            BackColor = Color.FromArgb(0, 180, 216),
            ForeColor = Color.Black,
            FlatStyle = FlatStyle.Flat,
            Height = 44,
            Dock = DockStyle.Top,
            Cursor = Cursors.Hand,
            Visible = false
        };
        _btnOpenBrowser.FlatAppearance.BorderSize = 0;
        _btnOpenBrowser.Click += (_, _) => OpenInBrowser();

        _btnRetry = new Button
        {
            Text = "Reintentar conexión integrada",
            Font = new Font("Segoe UI", 10, FontStyle.Regular),
            BackColor = Color.FromArgb(30, 41, 59),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat,
            Height = 36,
            Dock = DockStyle.Top,
            Cursor = Cursors.Hand,
            Visible = false,
            Margin = new Padding(0, 10, 0, 0)
        };
        _btnRetry.FlatAppearance.BorderSize = 0;
        _btnRetry.Click += async (_, _) => await InitializeWebViewAsync();

        _linkDownloadRuntime = new LinkLabel
        {
            Text = "¿Falta Microsoft WebView2? Descargar instalador oficial",
            Font = new Font("Segoe UI", 9, FontStyle.Regular),
            LinkColor = Color.FromArgb(56, 189, 248),
            ActiveLinkColor = Color.FromArgb(14, 165, 233),
            TextAlign = ContentAlignment.MiddleCenter,
            Dock = DockStyle.Top,
            Height = 30,
            Cursor = Cursors.Hand,
            Visible = false,
            Margin = new Padding(0, 12, 0, 0)
        };
        _linkDownloadRuntime.LinkClicked += (_, _) =>
        {
            try { Process.Start(new ProcessStartInfo("https://go.microsoft.com/fwlink/p/?LinkId=2124703") { UseShellExecute = true }); }
            catch { }
        };

        container.Controls.Add(_statusTitle, 0, 0);
        container.Controls.Add(_statusMessage, 0, 1);
        container.Controls.Add(_btnOpenBrowser, 0, 2);
        container.Controls.Add(_btnRetry, 0, 3);
        container.Controls.Add(_linkDownloadRuntime, 0, 4);

        _statusPanel.Controls.Add(container);
        _statusPanel.Resize += (_, _) =>
        {
            container.Location = new Point(
                Math.Max(10, (_statusPanel.ClientSize.Width - container.Width) / 2),
                Math.Max(10, (_statusPanel.ClientSize.Height - container.Height) / 2)
            );
        };

        Controls.Add(_statusPanel);
        _statusPanel.BringToFront();

        Shown += async (_, _) =>
        {
            await InitializeWebViewAsync();
        };
    }

    private static void EnableDarkMode(IntPtr handle)
    {
        try
        {
            if (Environment.OSVersion.Version.Major >= 10)
            {
                int darkMode = 1;
                if (DwmSetWindowAttribute(handle, DWMWA_USE_IMMERSIVE_DARK_MODE, ref darkMode, sizeof(int)) != 0)
                {
                    DwmSetWindowAttribute(handle, DWMWA_USE_IMMERSIVE_DARK_MODE_BEFORE_20H1, ref darkMode, sizeof(int));
                }
            }
        }
        catch { }
    }

    private static bool IsElevated()
    {
        try
        {
            using var identity = WindowsIdentity.GetCurrent();
            var principal = new WindowsPrincipal(identity);
            return principal.IsInRole(WindowsBuiltInRole.Administrator);
        }
        catch
        {
            return false;
        }
    }

    private void OpenInBrowser()
    {
        try
        {
            Process.Start(new ProcessStartInfo("http://127.0.0.1:47802/admin") { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            MessageBox.Show($"No se pudo abrir el navegador: {ex.Message}", "OpenDeck", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private async Task InitializeWebViewAsync()
    {
        if (_initialized || _initializing) return;
        _initializing = true;

        try
        {
        _statusTitle.Text = "OpenDeck";
        _statusMessage.Text = "Iniciando panel de control integrado...";
        _btnOpenBrowser.Visible = false;
        _btnRetry.Visible = false;
        _linkDownloadRuntime.Visible = false;
        _statusPanel.Visible = true;
        _statusPanel.BringToFront();

        var browser = EnsureBrowserControl();
        string? lastError = null;
        bool isElevated = IsElevated();

        // Always set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = --no-sandbox to bypass Chromium sandbox restrictions on Windows
        Environment.SetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--no-sandbox");

        var localAppDir = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var elevatedDir = Path.Combine(localAppDir, "OpenDeck", "WebView2_Admin");
        var userDir = Path.Combine(localAppDir, "OpenDeck", "WebView2");
        var tempFallback = Path.Combine(Path.GetTempPath(), "OpenDeck", isElevated ? "WV2_Admin" : "WV2_User");

        var candidates = new (string? folder, bool noSandbox)[]
        {
            (isElevated ? elevatedDir : userDir, true),
            (tempFallback, true),
            (isElevated ? elevatedDir : userDir, false),
            (Path.Combine(_dataDir, "webview2"), true),
            (null, true),
            (null, false)
        };

        var logFile = Path.Combine(localAppDir, "OpenDeck", "webview_debug.log");
        bool envSuccess = false;
        foreach (var (folder, noSandbox) in candidates)
        {
            try
            {
                if (!string.IsNullOrEmpty(folder))
                {
                    Directory.CreateDirectory(folder);
                }
                var opts = noSandbox
                    ? new Microsoft.Web.WebView2.Core.CoreWebView2EnvironmentOptions(additionalBrowserArguments: "--no-sandbox")
                    : null;
                var env = await CoreWebView2Environment.CreateAsync(null, folder, opts);
                await browser.EnsureCoreWebView2Async(env);
                envSuccess = true;
                try { File.AppendAllText(logFile, $"[{DateTime.Now}] SUCCESS: folder={folder}, ver={env.BrowserVersionString}\n"); } catch { }
                break;
            }
            catch (Exception ex)
            {
                lastError = ex.Message;
                try { File.AppendAllText(logFile, $"[{DateTime.Now}] FAIL: folder={folder}, ex={ex.GetType().Name}: {ex.Message} (0x{ex.HResult:X8})\n"); } catch { }
                // Once EnsureCoreWebView2Async fails on a control, it cannot be reused.
                // Replace with a fresh instance for the next attempt.
                DisposeBrowserControl();
                browser = EnsureBrowserControl();
            }
        }

        if (!envSuccess)
        {
            try
            {
                await browser.EnsureCoreWebView2Async(null);
                envSuccess = true;
            }
            catch (Exception ex)
            {
                lastError = ex.Message;
            }
        }

        if (envSuccess && browser.CoreWebView2 is not null)
        {
            var core = browser.CoreWebView2;
            var isDev = Environment.GetCommandLineArgs().Contains("--dev", StringComparer.OrdinalIgnoreCase);
            core.Settings.AreDevToolsEnabled = isDev;
            core.Settings.AreDefaultContextMenusEnabled = isDev;
            core.ProcessFailed += OnBrowserProcessFailed;
            core.NavigationStarting += (_, e) =>
            {
                if (!e.Uri.StartsWith("http://127.0.0.1:47802/", StringComparison.OrdinalIgnoreCase))
                {
                    e.Cancel = true;
                    try { Process.Start(new ProcessStartInfo(e.Uri) { UseShellExecute = true }); } catch { }
                }
            };

            core.NavigationCompleted += (_, e) =>
            {
                if (e.IsSuccess)
                {
                    _statusPanel.Visible = false;
                    browser.Visible = true;
                    browser.BringToFront();
                }
            };

            _initialized = true;
            browser.Source = new Uri("http://127.0.0.1:47802/admin");
            _statusPanel.Visible = false;
            browser.Visible = true;
            browser.BringToFront();
            return;
        }

        _statusTitle.Text = "OpenDeck - Servidor Activo";
        _statusMessage.Text = $"El servidor está activo en segundo plano, pero la vista integrada no pudo iniciarse.\n({lastError ?? "Error en WebView2"})";
        _btnOpenBrowser.Visible = true;
        _btnRetry.Visible = true;
        _linkDownloadRuntime.Visible = true;

        if (!_autoOpenedBrowser)
        {
            _autoOpenedBrowser = true;
            OpenInBrowser();
        }
        }
        finally
        {
            _initializing = false;
        }
    }

    private WebView2 EnsureBrowserControl()
    {
        if (_browser is not null) return _browser;
        _browser = new WebView2
        {
            Dock = DockStyle.Fill,
            Visible = false,
            DefaultBackgroundColor = Color.FromArgb(12, 15, 20)
        };
        Controls.Add(_browser);
        return _browser;
    }

    private void DisposeBrowserControl()
    {
        var browser = _browser;
        _browser = null;
        if (browser is not null)
        {
            try { if (browser.CoreWebView2 is not null) browser.CoreWebView2.ProcessFailed -= OnBrowserProcessFailed; } catch { }
            try { Controls.Remove(browser); } catch { }
            try { browser.Dispose(); } catch { }
        }

        // This WebView2 SDK exposes no Dispose on CoreWebView2Environment: dropping the
        // control releases CoreWebView2, and the native environment shuts down with it.
        _initialized = false;
        _suspended = false;
    }

    /// <summary>
    /// Drops the WebView2 control and its environment so no msedgewebview2.exe child
    /// survives a close-to-tray. The UserDataFolder stays on disk, so reopening keeps state.
    /// </summary>
    internal void ReleaseWebView()
    {
        _suspendTimer.Stop();
        DisposeBrowserControl();
        _statusPanel.Visible = true;

        // One collection per close (never on a timer), then a single working-set trim.
        GC.Collect(2, GCCollectionMode.Aggressive, blocking: true, compacting: true);
        SetProcessWorkingSetSize(GetCurrentProcess(), -1, -1);
    }

    internal void HideToTray()
    {
        Hide();
        ReleaseWebView();
    }

    internal void RestoreFromTray()
    {
        if (IsDisposed) return;
        Show();
        WindowState = FormWindowState.Normal;
        Activate();
        _ = InitializeWebViewAsync();
    }

    private void OnWindowResize(object? sender, EventArgs e)
    {
        if (WindowState == FormWindowState.Minimized)
        {
            try
            {
                if (_browser?.CoreWebView2 is { } core) core.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Low;
            }
            catch { }
            _suspendTimer.Start();
            return;
        }

        _suspendTimer.Stop();
        _ = ResumeBrowserAsync();
    }

    private async Task SuspendBrowserAsync()
    {
        try
        {
            if (WindowState != FormWindowState.Minimized || _suspended) return;
            if (_browser?.CoreWebView2 is not { } core) return;
            core.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Low;
            _suspended = await core.TrySuspendAsync();
        }
        catch
        {
            _suspended = false;
        }
    }

    private Task ResumeBrowserAsync()
    {
        try
        {
            if (_browser?.CoreWebView2 is { } core)
            {
                if (_suspended) core.Resume();
                core.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Normal;
            }
        }
        catch { }
        _suspended = false;
        return Task.CompletedTask;
    }

    private void OnBrowserProcessFailed(object? sender, CoreWebView2ProcessFailedEventArgs e)
    {
        AppLog.Warn($"WebView2 process failed ({e.ProcessFailedKind}); recreating the panel.");
        try
        {
            BeginInvoke(new Action(() =>
            {
                DisposeBrowserControl();
                _ = InitializeWebViewAsync();
            }));
        }
        catch { }
    }
}
