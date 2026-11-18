using System.Text;
using System.Text.Json;

namespace NexoDeck.Server.Services;

/// <summary>
/// Verifies the v2 implementation against docs/protocol-v2-vectors.json.
/// Run with <c>NexoDeck.Server.exe --verify-v2 docs/protocol-v2-vectors.json</c>;
/// the exit code is 0 when every value matches the Android client.
/// </summary>
internal static class ProtocolSelfTest
{
    public static int Run(string path)
    {
        var report = new StringBuilder();
        var failures = 0;

        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            var root = document.RootElement;
            var secret = root.GetProperty("pairSecret").GetString() ?? "";
            var serverId = root.GetProperty("serverId").GetString() ?? "";
            var deviceId = root.GetProperty("deviceId").GetString() ?? "";
            var nonceC = root.GetProperty("nonceC").GetString() ?? "";
            var nonceS = root.GetProperty("nonceS").GetString() ?? "";
            var expected = root.GetProperty("expected");

            var secretBytes = V2.FromB64Url(secret);
            var pairProof = V2.HmacB64(secretBytes, $"pair|{serverId}|{deviceId}|{nonceC}");
            Check(report, ref failures, "pairProof", pairProof, expected.GetProperty("pairProof").GetString());

            var deviceKey = V2.Hkdf(secretBytes, Encoding.UTF8.GetBytes(deviceId),
                $"nexodeck-device-key|{serverId}|{nonceC}|{nonceS}", 32);
            var deviceKeyText = V2.B64Url(deviceKey);
            Check(report, ref failures, "deviceKey", deviceKeyText, expected.GetProperty("deviceKey").GetString());

            var authProof = V2.HmacB64(deviceKey, $"auth|{serverId}|{nonceS}|{nonceC}");
            Check(report, ref failures, "authProof", authProof, expected.GetProperty("authProof").GetString());

            var sessionKey = V2.Hmac(deviceKey, $"sess|{serverId}|{nonceS}|{nonceC}");
            Check(report, ref failures, "sessionKey", V2.B64Url(sessionKey), expected.GetProperty("sessionKey").GetString());

            var channel = new SignedChannel(sessionKey, "s2c");
            foreach (var envelope in expected.GetProperty("envelopes").EnumerateArray())
            {
                var payload = envelope.GetProperty("payload").GetString() ?? "";
                var wrapped = JsonDocument.Parse(channel.Wrap(payload)).RootElement;
                var mac = wrapped.GetProperty("m").GetString();
                var counter = wrapped.GetProperty("n").GetInt32();
                Check(report, ref failures, $"envelope[{counter}].mac", mac, envelope.GetProperty("mac").GetString());
            }
        }
        catch (Exception ex)
        {
            report.AppendLine($"FAIL: {ex.Message}");
            failures++;
        }

        report.AppendLine(failures == 0 ? "OK: protocol v2 vectors match." : $"FAILED: {failures} mismatch(es).");
        try
        {
            var logPath = Path.Combine(Path.GetTempPath(), "nexodeck-v2-selftest.txt");
            File.WriteAllText(logPath, report.ToString());
            Console.WriteLine(report.ToString());
        }
        catch { }

        return failures == 0 ? 0 : 1;
    }

    private static void Check(StringBuilder report, ref int failures, string name, string? actual, string? expected)
    {
        if (string.Equals(actual, expected, StringComparison.Ordinal))
        {
            report.AppendLine($"ok   {name}");
            return;
        }
        failures++;
        report.AppendLine($"FAIL {name}: expected {expected}, got {actual}");
    }
}
