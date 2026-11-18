using System.Net;
using System.Net.Sockets;
using System.Text;

namespace NexoDeck.Server.Services;

/// <summary>
/// Minimal mDNS/DNS-SD responder for <c>_nexodeck._tcp.local</c>. It only runs
/// while the server is active and only answers queries for NexoDeck, so the
/// background traffic stays negligible.
/// </summary>
internal sealed class MdnsAdvertiser : IDisposable
{
    private const string ServiceType = "_nexodeck._tcp.local";
    private const string ServiceEnumeration = "_services._dns-sd._udp.local";

    private readonly string _instance;
    private readonly string _hostName;
    private readonly string _serverId;
    private readonly int _port;
    private readonly List<string> _addresses;
    private UdpClient? _client;
    private CancellationTokenSource? _cts;
    private Task? _loop;

    public MdnsAdvertiser(string pcName, string serverId, int port, List<string> addresses)
    {
        _instance = $"{Sanitize(pcName)}.{ServiceType}";
        _hostName = $"{Sanitize(Environment.MachineName)}.local";
        _serverId = serverId;
        _port = port;
        _addresses = addresses.Where(a => IPAddress.TryParse(a, out _)).ToList();
    }

    public void Start()
    {
        if (_addresses.Count == 0) return;
        try
        {
            _client = new UdpClient();
            _client.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
            _client.Client.Bind(new IPEndPoint(IPAddress.Any, 5353));
            _client.JoinMulticastGroup(IPAddress.Parse("224.0.0.251"));
            _client.MulticastLoopback = false;

            _cts = new CancellationTokenSource();
            SendAnnouncement();
            _loop = Task.Run(() => LoopAsync(_cts.Token));
        }
        catch (Exception ex)
        {
            AppLog.Warn($"mDNS no disponible: {ex.Message}");
            Dispose();
        }
    }

    private async Task LoopAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested && _client is not null)
        {
            try
            {
                var packet = await _client.ReceiveAsync(token);
                if (IsRelevantQuery(packet.Buffer)) SendAnnouncement();
            }
            catch (OperationCanceledException) { break; }
            catch (ObjectDisposedException) { break; }
            catch { }
        }
    }

    private static bool IsRelevantQuery(byte[] packet)
    {
        if (packet.Length < 13) return false;
        // QR bit set means this is a response, not a query.
        if ((packet[2] & 0x80) != 0) return false;
        var questions = (packet[4] << 8) | packet[5];
        if (questions <= 0) return false;

        var offset = 12;
        for (var i = 0; i < questions && offset < packet.Length; i++)
        {
            var labels = new List<string>();
            while (offset < packet.Length && packet[offset] != 0)
            {
                var length = packet[offset];
                offset++;
                if (length > 63 || offset + length > packet.Length) return false;
                labels.Add(Encoding.ASCII.GetString(packet, offset, length));
                offset += length;
            }
            offset += 5; // null label + QTYPE + QCLASS
            var name = string.Join(".", labels).ToLowerInvariant();
            if (name is ServiceType or ServiceEnumeration) return true;
        }
        return false;
    }

    private void SendAnnouncement()
    {
        if (_client is null) return;
        try
        {
            var packet = BuildResponse();
            var target = new IPEndPoint(IPAddress.Parse("224.0.0.251"), 5353);
            _client.Send(packet, packet.Length, target);
        }
        catch { }
    }

    private byte[] BuildResponse()
    {
        using var stream = new MemoryStream();
        using var writer = new BinaryWriter(stream, Encoding.ASCII);

        WriteU16(writer, 0);          // transaction id
        WriteU16(writer, 0x8400);     // response + authoritative
        WriteU16(writer, 0);          // questions
        WriteU16(writer, (ushort)(4 + _addresses.Count)); // answers
        WriteU16(writer, 0);          // authority
        WriteU16(writer, 0);          // additional

        // PTR: _nexodeck._tcp.local -> instance
        WriteName(writer, ServiceType);
        WriteU16(writer, 12);
        WriteU16(writer, 1);
        WriteU32(writer, 120);
        var rdataStart = stream.Position;
        WriteU16(writer, 0);
        WriteName(writer, _instance);
        PatchLength(writer, stream, rdataStart);

        // SRV: instance -> host:port
        WriteName(writer, _instance);
        WriteU16(writer, 33);
        WriteU16(writer, 0x8001);
        WriteU32(writer, 120);
        rdataStart = stream.Position;
        WriteU16(writer, 0);
        WriteU16(writer, 0);
        WriteU16(writer, 0);
        WriteU16(writer, (ushort)_port);
        WriteName(writer, _hostName);
        PatchLength(writer, stream, rdataStart);

        // TXT: sid / name / v / proto
        WriteName(writer, _instance);
        WriteU16(writer, 16);
        WriteU16(writer, 0x8001);
        WriteU32(writer, 120);
        rdataStart = stream.Position;
        WriteU16(writer, 0);
        WriteTxt(writer, $"sid={_serverId}");
        WriteTxt(writer, $"name={_instance[.._instance.IndexOf('.')]}");
        WriteTxt(writer, "proto=2");
        PatchLength(writer, stream, rdataStart);

        // A records for every LAN address
        foreach (var address in _addresses)
        {
            if (!IPAddress.TryParse(address, out var ip) || ip.AddressFamily != AddressFamily.InterNetwork) continue;
            WriteName(writer, _hostName);
            WriteU16(writer, 1);
            WriteU16(writer, 0x8001);
            WriteU32(writer, 120);
            WriteU16(writer, 4);
            var bytes = ip.GetAddressBytes();
            writer.Write(bytes);
        }

        writer.Flush();
        return stream.ToArray();
    }

    private static void PatchLength(BinaryWriter writer, MemoryStream stream, long rdataStart)
    {
        writer.Flush();
        var end = stream.Position;
        stream.Position = rdataStart;
        WriteU16(writer, (ushort)(end - rdataStart - 2));
        writer.Flush();
        stream.Position = end;
    }

    private static void WriteTxt(BinaryWriter writer, string value)
    {
        var bytes = Encoding.UTF8.GetBytes(value);
        writer.Write((byte)bytes.Length);
        writer.Write(bytes);
    }

    private static void WriteName(BinaryWriter writer, string name)
    {
        foreach (var label in name.Split('.', StringSplitOptions.RemoveEmptyEntries))
        {
            var bytes = Encoding.UTF8.GetBytes(label);
            writer.Write((byte)Math.Min(bytes.Length, 63));
            writer.Write(bytes, 0, Math.Min(bytes.Length, 63));
        }
        writer.Write((byte)0);
    }

    private static void WriteU16(BinaryWriter writer, ushort value)
    {
        writer.Write((byte)(value >> 8));
        writer.Write((byte)value);
    }

    private static void WriteU32(BinaryWriter writer, uint value)
    {
        writer.Write((byte)(value >> 24));
        writer.Write((byte)(value >> 16));
        writer.Write((byte)(value >> 8));
        writer.Write((byte)value);
    }

    private static string Sanitize(string value)
    {
        var clean = new string(value.Where(c => char.IsLetterOrDigit(c) || c is '-' or '_').ToArray());
        return string.IsNullOrWhiteSpace(clean) ? "NexoDeck" : clean[..Math.Min(clean.Length, 40)];
    }

    public void Dispose()
    {
        try { _cts?.Cancel(); } catch { }
        try { _client?.Dispose(); } catch { }
        _client = null;
        try { _loop?.Wait(250); } catch { }
        _cts?.Dispose();
        _cts = null;
    }
}
