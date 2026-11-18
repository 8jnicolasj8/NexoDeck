using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace NexoDeck.Server.Services;

/// <summary>
/// Protocol v2 primitives: HMAC-SHA256 proofs, HKDF key derivation and
/// base64url encoding without padding. See docs/PROTOCOLO.md.
/// </summary>
internal static class V2
{
    public static string B64Url(byte[] value) =>
        Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static byte[] FromB64Url(string value)
    {
        var normalized = value.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(normalized.PadRight(normalized.Length + (4 - normalized.Length % 4) % 4, '='));
    }

    public static byte[] Hmac(byte[] key, string text) =>
        HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(text));

    public static string HmacB64(byte[] key, string text) => B64Url(Hmac(key, text));

    public static byte[] Hkdf(byte[] ikm, byte[] salt, string info, int length) =>
        HKDF.DeriveKey(HashAlgorithmName.SHA256, ikm, length, salt, Encoding.UTF8.GetBytes(info));

    public static string RandomB64(int bytes) => B64Url(RandomNumberGenerator.GetBytes(bytes));

    /// <summary>Constant-time comparison of two base64url strings.</summary>
    public static bool FixedEquals(string left, string right)
    {
        try
        {
            var a = FromB64Url(left);
            var b = FromB64Url(right);
            return a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
        }
        catch (FormatException) { return false; }
    }
}

/// <summary>
/// Signed envelope for one direction of a v2 connection: every payload is
/// wrapped with a monotonic counter and a truncated HMAC, so a replayed,
/// skipped or tampered message closes the socket.
/// </summary>
internal sealed class SignedChannel(byte[] sessionKey, string direction)
{
    private readonly byte[] _key = sessionKey;
    private readonly string _direction = direction;
    private readonly object _sendLock = new();
    private int _send;
    private int _receive;

    public string Wrap(string payload)
    {
        int counter;
        string mac;
        lock (_sendLock)
        {
            counter = ++_send;
            mac = V2.B64Url(V2.Hmac(_key, $"{_direction}|{counter}|{payload}")[..16]);
        }
        return JsonSerializer.Serialize(new { n = counter, p = payload, m = mac });
    }

    public bool TryUnwrap(JsonElement envelope, out string? payload)
    {
        payload = null;
        if (envelope.ValueKind != JsonValueKind.Object) return false;
        if (!envelope.TryGetProperty("n", out var nElement) || !nElement.TryGetInt32(out var counter)) return false;
        if (!envelope.TryGetProperty("p", out var pElement) || pElement.ValueKind != JsonValueKind.String) return false;
        if (!envelope.TryGetProperty("m", out var mElement) || mElement.ValueKind != JsonValueKind.String) return false;

        var text = pElement.GetString() ?? "";
        var mac = mElement.GetString() ?? "";

        // Exactly the previous counter + 1: no gaps and no repeats.
        if (counter != _receive + 1) return false;
        var expected = V2.B64Url(V2.Hmac(_key, $"{_direction}|{counter}|{text}")[..16]);
        if (!V2.FixedEquals(expected, mac)) return false;

        _receive = counter;
        payload = text;
        return true;
    }
}
