using System.Net;
using System.Net.NetworkInformation;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Security.Principal;
using System.Text.Json;

namespace VexaDeck.Server.Services;

internal sealed class CertificateService : IDisposable
{
    private readonly string _directory;
    private readonly string _caPath;
    private readonly string _caExportPath;
    private readonly string _serverPath;
    private readonly string _sanPath;
    private readonly object _sync = new();
    private X509Certificate2? _serverCertificate;
    private readonly List<X509Certificate2> _retiredCertificates = [];

    public CertificateService(string dataDir)
    {
        _directory = Path.Combine(dataDir, "certs");
        _caPath = Path.Combine(_directory, "ca.pfx");
        _caExportPath = Path.Combine(_directory, "ca.crt");
        _serverPath = Path.Combine(_directory, "server.pfx");
        _sanPath = Path.Combine(_directory, "server-san.json");
        ProtectCertificateDirectory();
        EnsureAuthority();
        RefreshServerCertificate();
    }

    public X509Certificate2 CurrentServerCertificate => Volatile.Read(ref _serverCertificate) ?? throw new InvalidOperationException("No hay un certificado HTTPS cargado.");
    public byte[] ExportAuthorityCertificate() => File.ReadAllBytes(_caExportPath);

    public async Task WatchNetworkChangesAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try { await Task.Delay(TimeSpan.FromSeconds(30), cancellationToken); }
            catch (OperationCanceledException) { return; }
            RefreshServerCertificate();
        }
    }

    private void EnsureAuthority()
    {
        if (File.Exists(_caPath) && File.Exists(_caExportPath)) return;
        using var key = RSA.Create(3072);
        var request = new CertificateRequest("CN=VexaDeck Local Root CA", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(true, false, 0, true));
        request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.KeyCertSign | X509KeyUsageFlags.CrlSign, true));
        request.CertificateExtensions.Add(new X509SubjectKeyIdentifierExtension(request.PublicKey, false));
        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddYears(10));
        File.WriteAllBytes(_caPath, certificate.Export(X509ContentType.Pkcs12));
        File.WriteAllBytes(_caExportPath, certificate.Export(X509ContentType.Cert));
    }

    private void RefreshServerCertificate()
    {
        lock (_sync)
        {
            var names = GetSubjectNames();
            var knownNames = File.Exists(_sanPath) ? JsonSerializer.Deserialize<string[]>(File.ReadAllText(_sanPath)) ?? [] : [];
            if (_serverCertificate is null && File.Exists(_serverPath) && names.SequenceEqual(knownNames, StringComparer.OrdinalIgnoreCase))
            {
                try
                {
                    var existing = LoadPrivateCertificate(_serverPath);
                    if (existing.NotAfter.ToUniversalTime() > DateTime.UtcNow.AddDays(30))
                    {
                        _serverCertificate = existing;
                        return;
                    }
                    existing.Dispose();
                }
                catch (CryptographicException) { }
            }
            else if (_serverCertificate is not null && names.SequenceEqual(knownNames, StringComparer.OrdinalIgnoreCase) && _serverCertificate.NotAfter.ToUniversalTime() > DateTime.UtcNow.AddDays(30))
            {
                return;
            }

            using var ca = LoadPrivateCertificate(_caPath);
            using var caKey = ca.GetRSAPrivateKey() ?? throw new CryptographicException("La CA local no contiene una clave privada.");
            using var key = RSA.Create(2048);
            var hostName = Dns.GetHostName();
            var request = new CertificateRequest($"CN={hostName}", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            var alternatives = new SubjectAlternativeNameBuilder();
            alternatives.AddDnsName(hostName);
            foreach (var name in names)
            {
                if (IPAddress.TryParse(name, out var address)) alternatives.AddIpAddress(address);
                else if (!name.Equals(hostName, StringComparison.OrdinalIgnoreCase)) alternatives.AddDnsName(name);
            }
            request.CertificateExtensions.Add(alternatives.Build());
            request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
            request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, false));
            request.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(new OidCollection { new("1.3.6.1.5.5.7.3.1") }, true));
            request.CertificateExtensions.Add(new X509SubjectKeyIdentifierExtension(request.PublicKey, false));
            var serial = RandomNumberGenerator.GetBytes(16);
            using var signed = request.Create(ca, DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddYears(1), serial);
            using var server = signed.CopyWithPrivateKey(key);
            File.WriteAllBytes(_serverPath, server.Export(X509ContentType.Pkcs12));
            File.WriteAllText(_sanPath, JsonSerializer.Serialize(names));
            var replacement = LoadPrivateCertificate(_serverPath);
            var previous = Interlocked.Exchange(ref _serverCertificate, replacement);
            if (previous is not null) _retiredCertificates.Add(previous);
        }
    }

    private static string[] GetSubjectNames() => NetworkInterface.GetAllNetworkInterfaces()
        .Where(network => network.OperationalStatus == OperationalStatus.Up)
        .SelectMany(network => network.GetIPProperties().UnicastAddresses)
        .Select(entry => entry.Address)
        .Where(address => !IPAddress.IsLoopback(address) && IsPrivateOrLinkLocal(address))
        .Select(address => address.ToString())
        .Append(Dns.GetHostName())
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
        .ToArray();

    private static bool IsPrivateOrLinkLocal(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
        if (address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
        {
            var bytes = address.GetAddressBytes();
            return bytes[0] == 10 || bytes[0] == 192 && bytes[1] == 168 || bytes[0] == 172 && bytes[1] is >= 16 and <= 31 || bytes[0] == 169 && bytes[1] == 254;
        }
        return address.IsIPv6LinkLocal || address.ToString().StartsWith("fc", StringComparison.OrdinalIgnoreCase) || address.ToString().StartsWith("fd", StringComparison.OrdinalIgnoreCase);
    }

    private void ProtectCertificateDirectory()
    {
        Directory.CreateDirectory(_directory);
        try
        {
            var identity = WindowsIdentity.GetCurrent().User;
            if (identity is null) return;
            var dirInfo = new DirectoryInfo(_directory);
            var security = dirInfo.GetAccessControl();
            security.SetAccessRuleProtection(true, true);
            security.AddAccessRule(new FileSystemAccessRule(identity, FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
            dirInfo.SetAccessControl(security);
        }
        catch
        {
            // Running non-elevated; degrade gracefully
        }
    }

    private static X509Certificate2 LoadPrivateCertificate(string path) => new(path, (string?)null, X509KeyStorageFlags.Exportable);

    public void Dispose()
    {
        Interlocked.Exchange(ref _serverCertificate, null)?.Dispose();
        foreach (var certificate in _retiredCertificates) certificate.Dispose();
    }
}
