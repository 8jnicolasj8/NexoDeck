using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace NexoDeck.Server.Services;

internal sealed record LanAdapter(string Name, string Description, string Mac, List<string> Addresses, bool IsVirtual);

/// <summary>
/// LAN discovery helpers shared by /api/ident, mDNS and wake-on-LAN.
/// Only real, non-loopback interfaces are considered.
/// </summary>
internal static class NetworkInfo
{
    private static readonly string[] VirtualMarkers =
        ["virtual", "vmware", "hyper-v", "vethernet", "loopback", "tap-", "tun", "wsl", "docker", "bluetooth"];

    public static List<LanAdapter> GetAdapters()
    {
        var result = new List<LanAdapter>();
        foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (nic.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel) continue;
            if (nic.OperationalStatus != OperationalStatus.Up) continue;

            var props = nic.GetIPProperties();
            var addresses = props.UnicastAddresses
                .Where(a => a.Address.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(a.Address))
                .Select(a => a.Address.ToString())
                .ToList();
            if (addresses.Count == 0) continue;

            var mac = FormatMac(nic.GetPhysicalAddress());
            var description = $"{nic.Name} {nic.Description}".ToLowerInvariant();
            var isVirtual = VirtualMarkers.Any(description.Contains);
            result.Add(new LanAdapter(nic.Name, nic.Description, mac, addresses, isVirtual));
        }

        return result
            .OrderBy(a => a.IsVirtual)
            .ThenBy(a => a.Name)
            .ToList();
    }

    public static List<string> GetLanAddresses() =>
        GetAdapters().SelectMany(a => a.Addresses).Distinct().ToList();

    /// <summary>First physical MAC that can receive wake-on-LAN packets.</summary>
    public static string? GetPrimaryMac() =>
        GetAdapters().Where(a => !a.IsVirtual && a.Mac.Length == 17).Select(a => a.Mac).FirstOrDefault();

    public static List<string> GetBroadcastTargets()
    {
        var targets = new HashSet<string> { "255.255.255.255" };
        foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (nic.OperationalStatus != OperationalStatus.Up) continue;
            foreach (var unicast in nic.GetIPProperties().UnicastAddresses)
            {
                if (unicast.Address.AddressFamily != AddressFamily.InterNetwork || unicast.IPv4Mask is null) continue;
                var address = unicast.Address.GetAddressBytes();
                var mask = unicast.IPv4Mask.GetAddressBytes();
                if (address.Length != 4 || mask.Length != 4) continue;
                var broadcast = new byte[4];
                for (var i = 0; i < 4; i++) broadcast[i] = (byte)(address[i] | (mask[i] ^ 255));
                var broadcastAddress = new IPAddress(broadcast).ToString();
                if (broadcastAddress != "255.255.255.255") targets.Add(broadcastAddress);
            }
        }
        return targets.ToList();
    }

    public static string FormatMac(PhysicalAddress address)
    {
        var bytes = address.GetAddressBytes();
        if (bytes.Length != 6) return "";
        return string.Join("-", bytes.Select(b => b.ToString("X2")));
    }
}
