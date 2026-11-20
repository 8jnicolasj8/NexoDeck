using System.Security.Cryptography;
using System.Text;

namespace VexaDeck.Server.Services;

internal sealed class PairingService(ConfigService config)
{
    private readonly object _sync = new();
    private readonly Dictionary<string, DateTimeOffset> _codes = [];
    private readonly Dictionary<string, DateTimeOffset> _androidSecrets = [];

    public string CreateCode()
    {
        var code = Base64Url(RandomNumberGenerator.GetBytes(18));
        lock (_sync)
        {
            RemoveExpiredCodes();
            _codes[code] = DateTimeOffset.UtcNow.AddMinutes(5);
        }
        return code;
    }

    public DevicePairResult? Pair(string code, string deviceName)
    {
        if (string.IsNullOrWhiteSpace(deviceName) || deviceName.Length > 64) return null;
        lock (_sync)
        {
            RemoveExpiredCodes();
            if (!_codes.Remove(code, out var expiration) || expiration < DateTimeOffset.UtcNow) return null;
        }

        var token = Base64Url(RandomNumberGenerator.GetBytes(32));
        var device = new DeviceConfig(
            $"dev_{Base64Url(RandomNumberGenerator.GetBytes(9))}",
            deviceName.Trim(),
            Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))),
            DateTimeOffset.UtcNow);
        config.AddDevice(device);
        return new DevicePairResult(device.Id, device.Name, token, device.CreatedAt);
    }

    // --- Protocol v2: the pairing secret only travels through the QR or USB ---

    public (string Secret, DateTimeOffset ExpiresAt) CreateAndroidSecret()
    {
        var secret = Base64Url(RandomNumberGenerator.GetBytes(16));
        var expiresAt = DateTimeOffset.UtcNow.AddMinutes(5);
        lock (_sync)
        {
            RemoveExpiredCodes();
            _androidSecrets[secret] = expiresAt;
        }
        return (secret, expiresAt);
    }

    /// <summary>
    /// Verifies <c>pair2</c>. The secret is consumed only on success, and any
    /// pending secret is tried because the request does not name one.
    /// </summary>
    public string? VerifyAndroidPairing(string serverId, string deviceId, string nonceC, string proof)
    {
        lock (_sync)
        {
            RemoveExpiredCodes();
            foreach (var (secret, expiration) in _androidSecrets.ToArray())
            {
                if (expiration < DateTimeOffset.UtcNow) continue;
                var key = FromBase64Url(secret);
                var expected = Base64Url(HMACSHA256.HashData(key, Encoding.UTF8.GetBytes($"pair|{serverId}|{deviceId}|{nonceC}")));
                if (!V2.FixedEquals(expected, proof)) continue;
                _androidSecrets.Remove(secret);
                return secret;
            }
        }
        return null;
    }

    private void RemoveExpiredCodes()
    {
        foreach (var code in _codes.Where(item => item.Value <= DateTimeOffset.UtcNow).Select(item => item.Key).ToArray())
            _codes.Remove(code);
        foreach (var secret in _androidSecrets.Where(item => item.Value <= DateTimeOffset.UtcNow).Select(item => item.Key).ToArray())
            _androidSecrets.Remove(secret);
    }

    private static string Base64Url(byte[] value) => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] FromBase64Url(string value)
    {
        var normalized = value.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(normalized.PadRight(normalized.Length + (4 - normalized.Length % 4) % 4, '='));
    }
}

internal sealed record DevicePairResult(string Id, string Name, string Token, DateTimeOffset CreatedAt);
