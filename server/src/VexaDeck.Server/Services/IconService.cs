using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Win32;

namespace VexaDeck.Server.Services;

/// <summary>
/// Extracts high-quality shell icons through IShellItemImageFactory, stores them
/// as content-addressed PNG files and keeps a small on-disk index.
/// </summary>
internal sealed class IconService
{
    private const int IconSize = 128;
    private const int ExtractSize = 256;

    private readonly string _iconsDir;
    private readonly string _indexPath;
    private readonly object _lock = new();
    private readonly Dictionary<string, IconIndexEntry> _index;
    private readonly object _dataUrlLock = new();
    private readonly Dictionary<string, string> _dataUrlCache = new(StringComparer.OrdinalIgnoreCase);

    public IconService(string dataDir)
    {
        _iconsDir = Path.Combine(dataDir, "icons");
        _indexPath = Path.Combine(_iconsDir, "index.json");
        Directory.CreateDirectory(_iconsDir);
        _index = LoadIndex();
    }

    public string? GetIconPathByHash(string fileName)
    {
        var sanitized = Path.GetFileName(fileName);
        if (string.IsNullOrWhiteSpace(sanitized) ||
            sanitized.Length > 80 ||
            !sanitized.All(c => char.IsAsciiLetterOrDigit(c) || c is '.' or '-' or '_'))
        {
            return null;
        }

        if (!sanitized.Contains('.')) sanitized += ".png";
        var path = Path.Combine(_iconsDir, sanitized);
        return File.Exists(path) ? path : null;
    }

    /// <summary>
    /// Devuelve el ícono embebido como data URL. La app Android carga la web
    /// desde file:///android_asset, así que una ruta relativa como /icons/x.png
    /// apunta al paquete local y no a la PC: embebido se ve siempre igual.
    /// </summary>
    public string? GetDataUrl(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var name = Path.GetFileName(value);
        if (string.IsNullOrEmpty(name) || name.Length > 80) return null;
        if (!name.All(c => char.IsAsciiLetterOrDigit(c) || c is '.' or '-' or '_')) return null;

        lock (_dataUrlLock)
        {
            if (_dataUrlCache.TryGetValue(name, out var cached)) return cached;
        }

        var path = Path.Combine(_iconsDir, name);
        if (!File.Exists(path)) return null;

        try
        {
            var bytes = File.ReadAllBytes(path);
            if (bytes.Length == 0 || bytes.Length > 512 * 1024) return null;
            var mime = Path.GetExtension(name).Equals(".svg", StringComparison.OrdinalIgnoreCase)
                ? "image/svg+xml"
                : "image/png";
            var dataUrl = $"data:{mime};base64,{Convert.ToBase64String(bytes)}";

            lock (_dataUrlLock)
            {
                // Un techo chico alcanza: sólo viven los íconos de la botonera.
                if (_dataUrlCache.Count > 256) _dataUrlCache.Clear();
                _dataUrlCache[name] = dataUrl;
            }
            return dataUrl;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            AppLog.Warn($"No se pudo embeber el ícono {name}: {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// Convierte un <c>data:</c> URL de vuelta a su archivo en disco. Los íconos
    /// se guardan con el SHA-256 de sus bytes como nombre, así que la reversión
    /// es exacta y un cliente nunca puede inflar config.json con base64.
    /// </summary>
    public string? NormalizeIconValue(string? value)
    {
        if (value is null) return null;
        if (!value.StartsWith("data:", StringComparison.OrdinalIgnoreCase)) return value;

        var comma = value.IndexOf(',');
        if (comma < 0) return null;
        try
        {
            var bytes = Convert.FromBase64String(value[(comma + 1)..]);
            if (bytes.Length == 0) return null;
            var hash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
            if (File.Exists(Path.Combine(_iconsDir, $"{hash}.png"))) return $"/icons/{hash}.png";
            if (File.Exists(Path.Combine(_iconsDir, $"{hash}.svg"))) return $"/icons/{hash}.svg";
        }
        catch (FormatException) { return null; }
        return null;
    }

    /// <summary>Legacy helper used by the process list.</summary>
    public string? GetOrExtractIcon(string executablePathOrName) => GetIconUrl(executablePathOrName)?.Url;

    public IconResult? GetIconUrl(string? target)
    {
        if (string.IsNullOrWhiteSpace(target)) return null;
        var normalized = NormalizeTarget(target);
        if (string.IsNullOrWhiteSpace(normalized)) return null;

        var key = normalized.ToLowerInvariant();
        lock (_lock)
        {
            if (_index.TryGetValue(key, out var entry) && IconFileExists(entry.File) && !NeedsRefresh(entry))
            {
                return new($"/icons/{entry.File}");
            }

            try
            {
                using var source = LoadShellImage(normalized);
                if (source is null)
                {
                    return new(null, "No se pudo leer el ícono del archivo.");
                }

                var png = RenderToPng(source);
                var hash = Convert.ToHexString(SHA256.HashData(png)).ToLowerInvariant();
                var file = $"{hash}.png";
                var path = Path.Combine(_iconsDir, file);
                if (!File.Exists(path)) File.WriteAllBytes(path, png);

                _index[key] = new IconIndexEntry(file, normalized, SourceTimestamp(normalized));
                SaveIndex();
                return new($"/icons/{file}");
            }
            catch (Exception ex)
            {
                AppLog.Warn($"Icon extraction failed for '{normalized}': {ex.Message}");
                return new(null, ex.Message);
            }
        }
    }

    public IconResult SaveImage(Stream content, string fileName)
    {
        try
        {
            var extension = Path.GetExtension(fileName).ToLowerInvariant();
            if (extension == ".svg")
            {
                using var memory = new MemoryStream();
                content.CopyTo(memory);
                var bytes = memory.ToArray();
                if (bytes.Length == 0 || bytes.Length > 1024 * 1024)
                {
                    return new(null, "El SVG está vacío o supera 1 MB.");
                }
                var hash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
                var file = $"{hash}.svg";
                File.WriteAllBytes(Path.Combine(_iconsDir, file), bytes);
                return new($"/icons/{file}");
            }

            using var bitmap = LoadBitmap(content, extension);
            if (bitmap is null) return new(null, "No se pudo leer la imagen. Usá PNG, ICO o SVG.");
            var png = RenderToPng(bitmap);
            var sha = Convert.ToHexString(SHA256.HashData(png)).ToLowerInvariant();
            var pngFile = $"{sha}.png";
            File.WriteAllBytes(Path.Combine(_iconsDir, pngFile), png);
            return new($"/icons/{pngFile}");
        }
        catch (Exception ex)
        {
            AppLog.Warn($"Icon upload failed: {ex.Message}");
            return new(null, ex.Message);
        }
    }

    public bool IconFileMissing(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return true;
        var name = Path.GetFileName(value);
        return !File.Exists(Path.Combine(_iconsDir, name));
    }

    private bool NeedsRefresh(IconIndexEntry entry)
    {
        var normalized = entry.Source;
        if (string.IsNullOrEmpty(normalized)) return false;
        if (normalized.StartsWith("shell:AppsFolder\\", StringComparison.OrdinalIgnoreCase)) return false;
        try
        {
            var target = normalized;
            if (target.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase))
            {
                var resolved = ResolveShortcutTarget(target);
                if (!string.IsNullOrEmpty(resolved) && File.Exists(resolved))
                {
                    var resolvedTicks = File.GetLastWriteTimeUtc(resolved).Ticks;
                    if (resolvedTicks > entry.SourceTicks) return true;
                }
            }
            return File.Exists(target) && File.GetLastWriteTimeUtc(target).Ticks > entry.SourceTicks;
        }
        catch { return false; }
    }

    private static long SourceTimestamp(string target)
    {
        try
        {
            if (target.StartsWith("shell:", StringComparison.OrdinalIgnoreCase)) return 0;
            if (target.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase))
            {
                var resolved = ResolveShortcutTarget(target);
                if (!string.IsNullOrEmpty(resolved) && File.Exists(resolved))
                {
                    return Math.Max(File.GetLastWriteTimeUtc(resolved).Ticks, File.GetLastWriteTimeUtc(target).Ticks);
                }
            }
            return File.Exists(target) ? File.GetLastWriteTimeUtc(target).Ticks : 0;
        }
        catch { return 0; }
    }

    private static string? ResolveShortcutTarget(string lnkPath)
    {
        try
        {
            var shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType is null) return null;
            dynamic shell = Activator.CreateInstance(shellType)!;
            dynamic shortcut = shell.CreateShortcut(lnkPath);
            return shortcut.TargetPath as string;
        }
        catch { return null; }
    }

    private static string NormalizeTarget(string target)
    {
        var trimmed = target.Trim().Trim('"');
        if (trimmed.StartsWith("shell:", StringComparison.OrdinalIgnoreCase)) return trimmed;
        if (File.Exists(trimmed)) return Path.GetFullPath(trimmed);

        // Store/UWP AUMIDs look like "Package_family!AppId".
        if (trimmed.Contains('!') && !trimmed.Contains('\\') && !trimmed.Contains('/'))
        {
            return $"shell:AppsFolder\\{trimmed}";
        }

        var resolved = ResolveExecutablePath(trimmed);
        return string.IsNullOrEmpty(resolved) ? null : resolved;
    }

    private static string ResolveExecutablePath(string pathOrName)
    {
        if (File.Exists(pathOrName)) return Path.GetFullPath(pathOrName);

        var name = Path.GetFileName(pathOrName);
        var baseName = Path.GetFileNameWithoutExtension(pathOrName);

        try
        {
            foreach (var process in Process.GetProcessesByName(baseName))
            {
                try
                {
                    var file = process.MainModule?.FileName;
                    if (!string.IsNullOrEmpty(file) && File.Exists(file)) return file;
                }
                catch { }
                finally { process.Dispose(); }
            }
        }
        catch { }

        try
        {
            using var key = Registry.LocalMachine.OpenSubKey($@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{name}");
            if (key?.GetValue("") is string appPath && File.Exists(appPath)) return appPath;
        }
        catch { }

        var pathEnv = Environment.GetEnvironmentVariable("PATH");
        if (!string.IsNullOrEmpty(pathEnv))
        {
            foreach (var dir in pathEnv.Split(';', StringSplitOptions.RemoveEmptyEntries))
            {
                try
                {
                    var candidate = Path.Combine(dir.Trim(), name);
                    if (File.Exists(candidate)) return Path.GetFullPath(candidate);
                }
                catch { }
            }
        }

        return "";
    }

    private static Bitmap? LoadBitmap(Stream content, string extension)
    {
        if (extension == ".ico")
        {
            using var icon = new Icon(content);
            using var bitmap = icon.ToBitmap();
            return new Bitmap(bitmap);
        }

        using var image = Image.FromStream(content, useEmbeddedColorManagement: true, validateImageData: true);
        return new Bitmap(image);
    }

    private static Bitmap? LoadShellImage(string parsingName)
    {
        var iid = typeof(IShellItemImageFactory).GUID;
        var hr = SHCreateItemFromParsingName(parsingName, IntPtr.Zero, ref iid, out var item);
        if (hr != 0 || item is null) return null;

        try
        {
            var factory = (IShellItemImageFactory)item;
            var flags = SIIGBF.ICONONLY | SIIGBF.BIGGERSIZEOK | SIIGBF.SCALEUP;
            if (factory.GetImage(new SIZE(ExtractSize, ExtractSize), flags, out var hBitmap) != 0 || hBitmap == IntPtr.Zero)
            {
                return null;
            }

            try
            {
                using var image = Image.FromHbitmap(hBitmap);
                return new Bitmap(image);
            }
            finally
            {
                DeleteObject(hBitmap);
            }
        }
        finally
        {
            Marshal.ReleaseComObject(item);
        }
    }

    private static byte[] RenderToPng(Bitmap source)
    {
        using var canvas = new Bitmap(IconSize, IconSize, PixelFormat.Format32bppArgb);
        using (var graphics = Graphics.FromImage(canvas))
        {
            graphics.Clear(Color.Transparent);
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            graphics.SmoothingMode = SmoothingMode.HighQuality;
            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
            graphics.CompositingQuality = CompositingQuality.HighQuality;

            var scale = Math.Min((float)IconSize / source.Width, (float)IconSize / source.Height);
            var width = Math.Max(1, (int)Math.Round(source.Width * scale));
            var height = Math.Max(1, (int)Math.Round(source.Height * scale));
            var x = (IconSize - width) / 2;
            var y = (IconSize - height) / 2;
            graphics.DrawImage(source, new Rectangle(x, y, width, height));
        }

        using var stream = new MemoryStream();
        canvas.Save(stream, ImageFormat.Png);
        return stream.ToArray();
    }

    private bool IconFileExists(string file) => File.Exists(Path.Combine(_iconsDir, file));

    private Dictionary<string, IconIndexEntry> LoadIndex()
    {
        try
        {
            if (!File.Exists(_indexPath)) return new(StringComparer.OrdinalIgnoreCase);
            var entries = JsonSerializer.Deserialize<Dictionary<string, IconIndexEntry>>(File.ReadAllText(_indexPath));
            return entries is null
                ? new(StringComparer.OrdinalIgnoreCase)
                : new Dictionary<string, IconIndexEntry>(entries, StringComparer.OrdinalIgnoreCase);
        }
        catch
        {
            return new(StringComparer.OrdinalIgnoreCase);
        }
    }

    private void SaveIndex()
    {
        try
        {
            File.WriteAllText(_indexPath, JsonSerializer.Serialize(_index, new JsonSerializerOptions
            {
                WriteIndented = false,
                DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
            }));
        }
        catch (Exception ex)
        {
            AppLog.Warn($"Could not save icon index: {ex.Message}");
        }
    }

    private sealed record IconIndexEntry(string File, string Source, long SourceTicks);

    [StructLayout(LayoutKind.Sequential)]
    private readonly struct SIZE(int width, int height)
    {
        public readonly int Width = width;
        public readonly int Height = height;
    }

    [Flags]
    private enum SIIGBF : uint
    {
        RESIZETOFIT = 0x00,
        BIGGERSIZEOK = 0x01,
        MEMORYONLY = 0x02,
        ICONONLY = 0x04,
        THUMBNAILONLY = 0x08,
        INCACHEONLY = 0x10,
        CROPTOSQUARE = 0x20,
        WIDETHUMBNAILS = 0x40,
        ICONBACKGROUND = 0x80,
        SCALEUP = 0x100
    }

    [ComImport]
    [Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItemImageFactory
    {
        [PreserveSig]
        int GetImage(SIZE size, SIIGBF flags, out IntPtr phbm);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
    private static extern int SHCreateItemFromParsingName(
        string pszPath,
        IntPtr pbc,
        ref Guid riid,
        [MarshalAs(UnmanagedType.Interface)] out object? ppv);

    [DllImport("gdi32.dll")]
    private static extern bool DeleteObject(IntPtr hObject);
}

internal sealed record IconResult(string? Url, string? Error = null);
