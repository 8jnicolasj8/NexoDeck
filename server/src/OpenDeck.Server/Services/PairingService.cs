using System.Security.Cryptography;
using System.Text;

namespace OpenDeck.Server.Services;

internal sealed class PairingService(ConfigService config)
{
    private readonly object _sync = new();
    private readonly Dictionary<string, DateTimeOffset> _codes = [];

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

    private void RemoveExpiredCodes()
    {
        foreach (var code in _codes.Where(item => item.Value <= DateTimeOffset.UtcNow).Select(item => item.Key).ToArray())
            _codes.Remove(code);
    }

    private static string Base64Url(byte[] value) => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}

internal sealed record DevicePairResult(string Id, string Name, string Token, DateTimeOffset CreatedAt);
