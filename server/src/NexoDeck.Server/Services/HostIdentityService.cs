using NexoDeck.Server.Hosting;

namespace NexoDeck.Server.Services;

/// <summary>
/// Stable identity of this PC: serverId (generated once), display name, colour
/// and icon. Shared by /api/ident, mDNS and the pairing QR.
/// </summary>
internal sealed class HostIdentityService(ConfigService config)
{
    private static readonly string[] Palette =
        ["#00FF9C", "#4FC3F7", "#FFB74D", "#BA68C8", "#FF7043", "#9CCC65", "#F06292", "#64B5F6"];

    public HostConfig Ensure()
    {
        var host = config.Read().Host;
        var changed = false;
        if (string.IsNullOrWhiteSpace(host.ServerId))
        {
            host = host with { ServerId = Guid.NewGuid().ToString("D") };
            changed = true;
        }
        if (string.IsNullOrWhiteSpace(host.PcName))
        {
            host = host with { PcName = Environment.MachineName };
            changed = true;
        }
        if (string.IsNullOrWhiteSpace(host.PcColor))
        {
            host = host with { PcColor = Palette[Random.Shared.Next(Palette.Length)] };
            changed = true;
        }
        if (changed) config.SaveHost(host);
        return host;
    }

    public string ServerId => Ensure().ServerId;
    public string PcName => Ensure().PcName ?? Environment.MachineName;

    public object Ident()
    {
        var host = Ensure();
        var hub = config.Read();
        var adapters = NetworkInfo.GetAdapters();
        var addresses = adapters.SelectMany(a => a.Addresses).Distinct().ToList();
        return new
        {
            app = "nexodeck",
            serverId = host.ServerId,
            pcName = host.PcName,
            pcColor = host.PcColor,
            pcIcon = host.PcIcon,
            version = LocalServer.AppVersion,
            protocol = new[] { 1, 2 },
            addresses,
            httpPort = hub.Server.HttpPort,
            httpsPort = hub.Server.HttpsPort,
            mac = NetworkInfo.GetPrimaryMac(),
            macs = adapters.Where(a => a.Mac.Length == 17).Select(a => a.Mac).Distinct().ToList(),
            wolPort = host.WolPort,
            wake = host.WolEnabled && NetworkInfo.GetPrimaryMac() is not null
        };
    }

    /// <summary>Deep link consumed by the Android app to pair without a QR scan.</summary>
    public string PairLink(string secret, DateTimeOffset expiresAt, string? addressOverride = null)
    {
        var host = Ensure();
        var addresses = string.Join(",", NetworkInfo.GetLanAddresses().Append("127.0.0.1").Distinct());
        if (!string.IsNullOrWhiteSpace(addressOverride)) addresses = addressOverride;
        var mac = NetworkInfo.GetPrimaryMac() ?? "";
        var name = Uri.EscapeDataString(host.PcName ?? Environment.MachineName);
        return $"nexodeck://pair?v=2&sid={host.ServerId}&name={name}&color={Uri.EscapeDataString(host.PcColor)}" +
               $"&addr={Uri.EscapeDataString(addresses)}&port={config.Read().Server.HttpPort}" +
               $"&s={secret}&exp={expiresAt.ToUnixTimeSeconds()}&mac={Uri.EscapeDataString(mac)}&ver={LocalServer.AppVersion}";
    }
}
