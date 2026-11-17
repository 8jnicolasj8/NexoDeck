using System.Drawing;
using System.Windows.Forms;

namespace OpenDeck.Server.Window;

internal static class AppIconHelper
{
    private static Icon? _cachedIcon;

    public static Icon GetAppIcon()
    {
        if (_cachedIcon is not null) return _cachedIcon;

        try
        {
            var iconPath = Path.Combine(AppContext.BaseDirectory, "app.ico");
            if (File.Exists(iconPath))
            {
                _cachedIcon = new Icon(iconPath, 256, 256);
                return _cachedIcon;
            }
        }
        catch { }

        try
        {
            var exePath = Environment.ProcessPath ?? Application.ExecutablePath;
            if (!string.IsNullOrEmpty(exePath) && File.Exists(exePath))
            {
                var extracted = Icon.ExtractAssociatedIcon(exePath);
                if (extracted is not null)
                {
                    _cachedIcon = extracted;
                    return _cachedIcon;
                }
            }
        }
        catch { }

        return SystemIcons.Application;
    }
}
