using System.Net;
using System.Net.Sockets;

namespace VexaDeck.Server.Services;

/// <summary>
/// Wake-on-LAN magic packets. The phone sends these itself when the PC is off;
/// the server exposes the same helper so the panel can test the setup.
/// </summary>
internal static class WakeOnLan
{
    public static byte[] BuildMagicPacket(string mac)
    {
        var clean = new string(mac.Where(Uri.IsHexDigit).ToArray());
        if (clean.Length != 12) throw new ArgumentException("MAC inválida", nameof(mac));
        var macBytes = Convert.FromHexString(clean);
        var packet = new byte[6 + 16 * 6];
        for (var i = 0; i < 6; i++) packet[i] = 0xFF;
        for (var i = 0; i < 16; i++) Buffer.BlockCopy(macBytes, 0, packet, 6 + i * 6, 6);
        return packet;
    }

    /// <summary>Sends the magic packet to every local broadcast address.</summary>
    public static bool Send(string mac, int port = 9)
    {
        byte[] packet;
        try { packet = BuildMagicPacket(mac); }
        catch (ArgumentException) { return false; }

        var sent = false;
        using var udp = new UdpClient { EnableBroadcast = true };
        foreach (var target in NetworkInfo.GetBroadcastTargets())
        {
            try
            {
                udp.Send(packet, packet.Length, new IPEndPoint(IPAddress.Parse(target), port));
                sent = true;
            }
            catch { }
        }
        return sent;
    }
}
