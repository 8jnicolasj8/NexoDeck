using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace VexaDeck.Server.Services;

/// <summary>Error de Spotify con un mensaje listo para mostrar en el panel.</summary>
internal sealed class SpotifyException : Exception
{
    public SpotifyException(string message, Exception? inner = null) : base(message, inner) { }
}

/// <summary>Tokens de la cuenta vinculada. Se cifran con DPAPI antes de tocar el disco.</summary>
internal sealed record SpotifyLink(
    string AccessToken,
    string RefreshToken,
    DateTimeOffset ExpiresAt,
    string Scope,
    string? DisplayName,
    string? AccountId);

/// <summary>Canción actual según la Web API de Spotify.</summary>
internal sealed record SpotifyTrackInfo(
    string Id,
    string Title,
    string Artists,
    string Album,
    string? ImageUrl,
    bool Playing,
    int ProgressMs,
    int DurationMs);

/// <summary>Estado que el panel muestra en la tarjeta de integración.</summary>
internal sealed record SpotifyStatus(
    bool Linked,
    bool ClientIdConfigured,
    string? DisplayName,
    string RedirectUri,
    IReadOnlyList<string> Scopes,
    DateTimeOffset? ExpiresAt);

/// <summary>
/// Vinculación con Spotify usando OAuth 2.0 + PKCE, pensada para una app de
/// escritorio sin Client Secret.
///
/// - El flujo abre el navegador del sistema y escucha la redirección en un
///   servidor de loopback efímero (Kestrel, ya que HttpListener requiere
///   reservar la URL con privilegios de administrador en Windows).
/// - El code_verifier y el state viven solo en memoria y se validan antes de
///   canjear el código.
/// - Los tokens se guardan cifrados con DPAPI (ámbito del usuario actual), así
///   que otro usuario de Windows no puede leerlos ni copiarlos a otra máquina.
/// - El access_token se renueva solo con el refresh_token cuando está por
///   expirar, con un único refresh en vuelo aunque haya varias llamadas.
/// </summary>
internal sealed class SpotifyAuthService : IAsyncDisposable
{
    // Endpoints oficiales (developer.spotify.com/documentation/web-api).
    private const string AuthorizeEndpoint = "https://accounts.spotify.com/authorize";
    private const string TokenEndpoint = "https://accounts.spotify.com/api/token";
    private const string ApiBase = "https://api.spotify.com/v1";
    private const string UserAgent = "VexaDeck/1.1 (+https://github.com/8jnicolasj8/VexaDeck)";

    /// <summary>
    /// Puerto fijo: Spotify exige que el redirect_uri coincida carácter por
    /// carácter con el registrado en el panel de desarrollador.
    /// </summary>
    public const int LoopbackPort = 47810;
    public const string RedirectUri = "http://127.0.0.1:47810/callback";

    /// <summary>Scopes de una botonera: leer/controlar la reproducción y ver playlists privadas.</summary>
    public static readonly IReadOnlyList<string> Scopes = new[]
    {
        "user-read-playback-state",
        "user-modify-playback-state",
        "user-read-currently-playing",
        "playlist-read-private"
    };

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly string _dataDir;
    private readonly string _tokensPath;
    private readonly string _clientIdPath;
    private readonly HttpClient _http;
    private readonly SemaphoreSlim _refreshGate = new(1, 1);

    private SpotifyLink? _link;
    private string? _clientId;

    public SpotifyAuthService(string dataDir)
    {
        _dataDir = dataDir;
        _tokensPath = Path.Combine(dataDir, "spotify.tokens");
        _clientIdPath = Path.Combine(dataDir, "spotify.client");
        _http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        _http.DefaultRequestHeaders.UserAgent.ParseAdd(UserAgent);
        _link = LoadLink();
        _clientId = ReadClientId();
    }

    public bool IsLinked => _link is not null;

    public string? ClientId => _clientId;

    public SpotifyStatus GetStatus() => new(
        IsLinked,
        !string.IsNullOrWhiteSpace(_clientId),
        _link?.DisplayName,
        RedirectUri,
        Scopes,
        _link?.ExpiresAt);

    /// <summary>Guarda (o borra, con null/vacío) el Client ID de la app de Spotify.</summary>
    public void SetClientId(string? clientId)
    {
        var value = (clientId ?? "").Trim();
        if (value.Length > 0 && (value.Length < 16 || value.Length > 64 || value.Any(char.IsWhiteSpace)))
        {
            throw new SpotifyException("El Client ID no parece válido: son 32 caracteres sin espacios.");
        }

        try
        {
            if (value.Length == 0)
            {
                if (File.Exists(_clientIdPath)) File.Delete(_clientIdPath);
                _clientId = null;
                return;
            }

            Directory.CreateDirectory(_dataDir);
            File.WriteAllText(_clientIdPath, value);
            _clientId = value;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            throw new SpotifyException("No se pudo guardar el Client ID en la carpeta de datos.", ex);
        }
    }

    /// <summary>
    /// Abre el navegador, escucha el callback en 127.0.0.1 y canjea el código.
    /// Devuelve cuando la cuenta quedó vinculada (o lanza <see cref="SpotifyException"/>).
    /// </summary>
    public async Task<SpotifyStatus> LinkAsync(CancellationToken token)
    {
        var clientId = _clientId;
        if (string.IsNullOrWhiteSpace(clientId))
        {
            throw new SpotifyException("Configurá primero el Client ID de tu app de Spotify.");
        }

        // PKCE: verifier aleatorio y su challenge S256.
        var verifier = CreateRandomString(64);
        var challenge = Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
        var state = CreateRandomString(32);

        var completion = new TaskCompletionSource<(bool Ok, string? Code, string? Error)>(
            TaskCreationOptions.RunContinuationsAsynchronously);

        var builder = WebApplication.CreateSlimBuilder();
        builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel(options => options.Listen(IPAddress.Loopback, LoopbackPort));
        await using var app = builder.Build();

        app.MapGet("/callback", async context =>
        {
            var query = context.Request.Query;
            var error = query["error"].ToString();
            var code = query["code"].ToString();
            var returnedState = query["state"].ToString();

            context.Response.ContentType = "text/html; charset=utf-8";
            context.Response.Headers.CacheControl = "no-store";

            if (!string.IsNullOrEmpty(error))
            {
                await context.Response.WriteAsync(HtmlPage(
                    "No pudimos conectar",
                    error == "access_denied"
                        ? "Cancelaste el permiso en Spotify. Podés cerrar esta ventana y volver a intentarlo cuando quieras."
                        : $"Spotify devolvió un error: {error}. Podés cerrar esta ventana y reintentar.",
                    ok: false));
                completion.TrySetResult((false, null, error));
                return;
            }

            if (!string.IsNullOrEmpty(returnedState) &&
                CryptographicOperations.FixedTimeEquals(
                    Encoding.ASCII.GetBytes(returnedState), Encoding.ASCII.GetBytes(state)))
            {
                await context.Response.WriteAsync(HtmlPage(
                    "Conexión exitosa",
                    "Ya podés cerrar esta ventana y volver a VexaDeck.",
                    ok: true));
                completion.TrySetResult((true, code, null));
                return;
            }

            await context.Response.WriteAsync(HtmlPage(
                "No pudimos verificar la respuesta",
                "El parámetro state no coincide con el que envió VexaDeck, así que descartamos la respuesta por seguridad. Volvé a intentarlo desde el panel.",
                ok: false));
            completion.TrySetResult((false, null, "state_mismatch"));
        });

        try
        {
            await app.StartAsync(token);
        }
        catch (Exception ex) when (ex is IOException or SocketException)
        {
            throw new SpotifyException(
                $"No se pudo abrir el puerto local {LoopbackPort}. Cerrá la otra ventana de VexaDeck y reintentá.", ex);
        }

        try
        {
            Process.Start(new ProcessStartInfo(BuildAuthorizeUrl(clientId, challenge, state)) { UseShellExecute = true });
        }
        catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception)
        {
            throw new SpotifyException("No se pudo abrir el navegador predeterminado.", ex);
        }

        (bool Ok, string? Code, string? Error) result;
        try
        {
            result = await completion.Task.WaitAsync(TimeSpan.FromMinutes(5), token);
        }
        catch (TimeoutException)
        {
            throw new SpotifyException("La vinculación tardó más de 5 minutos y se canceló. Volvé a intentarlo.");
        }
        finally
        {
            // Damos un instante para que la respuesta HTML llegue al navegador.
            await Task.Delay(250, CancellationToken.None);
            await StopQuietlyAsync(app, token);
        }

        if (!result.Ok)
        {
            throw new SpotifyException(result.Error switch
            {
                "access_denied" => "Cancelaste el permiso en Spotify.",
                "state_mismatch" => "La respuesta de Spotify no superó la validación de seguridad.",
                _ => $"Spotify devolvió un error: {result.Error}."
            });
        }

        if (string.IsNullOrEmpty(result.Code))
        {
            throw new SpotifyException("Spotify no devolvió un código de autorización.");
        }

        var link = await ExchangeCodeAsync(clientId, result.Code!, verifier, token);
        var profile = await TryGetProfileAsync(link.AccessToken, token);
        if (profile is not null)
        {
            link = link with { DisplayName = profile.Value.Name, AccountId = profile.Value.Id };
        }

        await SaveLinkAsync(link);
        AppLog.Info($"Spotify vinculado{(string.IsNullOrWhiteSpace(link.DisplayName) ? "" : $" ({link.DisplayName})")}.");
        return GetStatus();
    }

    /// <summary>Borra los tokens locales: el usuario tendrá que volver a vincular.</summary>
    public void Unlink()
    {
        _link = null;
        try
        {
            if (File.Exists(_tokensPath)) File.Delete(_tokensPath);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            AppLog.Warn($"No se pudo borrar spotify.tokens: {ex.Message}");
        }
    }

    /// <summary>Access token válido, renovándolo con el refresh_token si hace falta.</summary>
    public async Task<string> GetAccessTokenAsync(CancellationToken token)
    {
        var link = _link ?? throw new SpotifyException("Vinculá tu cuenta de Spotify desde el panel de VexaDeck.");
        if (link.ExpiresAt > DateTimeOffset.UtcNow.AddSeconds(60)) return link.AccessToken;

        await _refreshGate.WaitAsync(token);
        try
        {
            link = _link ?? throw new SpotifyException("Vinculá tu cuenta de Spotify desde el panel de VexaDeck.");
            if (link.ExpiresAt > DateTimeOffset.UtcNow.AddSeconds(60)) return link.AccessToken;

            var clientId = _clientId
                ?? throw new SpotifyException("Falta el Client ID de Spotify: configuralo en el panel.");

            using var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "refresh_token",
                ["refresh_token"] = link.RefreshToken,
                ["client_id"] = clientId
            });

            using var response = await _http.PostAsync(TokenEndpoint, content, token);
            var body = await response.Content.ReadAsStringAsync(token);
            if (!response.IsSuccessStatusCode)
            {
                // invalid_grant: el usuario revocó el acceso o cambió la contraseña.
                Unlink();
                AppLog.Warn($"Spotify rechazó el refresh_token ({response.StatusCode}): {Truncate(body, 200)}");
                throw new SpotifyException("La sesión de Spotify expiró. Vinculá la cuenta de nuevo desde el panel.");
            }

            var refreshed = ParseTokenResponse(body, link.RefreshToken, link.Scope, link.DisplayName, link.AccountId);
            await SaveLinkAsync(refreshed);
            return refreshed.AccessToken;
        }
        finally
        {
            _refreshGate.Release();
        }
    }

    /// <summary>Canción actual; null cuando no hay reproducción activa.</summary>
    public async Task<SpotifyTrackInfo?> GetCurrentlyPlayingAsync(CancellationToken token)
    {
        var root = await SendAsync(HttpMethod.Get, "/me/player/currently-playing", token);
        if (root is not { ValueKind: JsonValueKind.Object } json) return null;
        if (!json.TryGetProperty("item", out var item) || item.ValueKind != JsonValueKind.Object) return null;

        var title = GetString(item, "name") ?? "";
        if (title.Length == 0) return null;

        var artists = item.TryGetProperty("artists", out var artistArray) && artistArray.ValueKind == JsonValueKind.Array
            ? string.Join(", ", artistArray.EnumerateArray().Select(artist => GetString(artist, "name")).Where(name => !string.IsNullOrWhiteSpace(name)))
            : "";

        var album = item.TryGetProperty("album", out var albumNode) && albumNode.ValueKind == JsonValueKind.Object
            ? GetString(albumNode, "name") ?? ""
            : "";

        string? imageUrl = null;
        if (item.TryGetProperty("album", out var albumWithImages) &&
            albumWithImages.ValueKind == JsonValueKind.Object &&
            albumWithImages.TryGetProperty("images", out var images) &&
            images.ValueKind == JsonValueKind.Array)
        {
            var first = images.EnumerateArray().FirstOrDefault();
            if (first.ValueKind == JsonValueKind.Object) imageUrl = GetString(first, "url");
        }

        var playing = json.TryGetProperty("is_playing", out var isPlaying) && isPlaying.ValueKind == JsonValueKind.True;
        var progress = json.TryGetProperty("progress_ms", out var progressNode) && progressNode.TryGetInt32(out var parsedProgress) ? parsedProgress : 0;
        var duration = item.TryGetProperty("duration_ms", out var durationNode) && durationNode.TryGetInt32(out var parsedDuration) ? parsedDuration : 0;

        return new SpotifyTrackInfo(
            GetString(item, "id") ?? "",
            title,
            artists,
            album,
            imageUrl,
            playing,
            progress,
            duration);
    }

    /// <summary>
    /// Reproducir/pausar según el estado real del reproductor: así el botón hace
    /// lo que el usuario espera aunque haya cambiado de dispositivo.
    /// </summary>
    public async Task<bool> TogglePlaybackAsync(CancellationToken token)
    {
        var player = await SendAsync(HttpMethod.Get, "/me/player", token);
        var playing = player is { ValueKind: JsonValueKind.Object } state &&
                      state.TryGetProperty("is_playing", out var isPlaying) &&
                      isPlaying.ValueKind == JsonValueKind.True;

        await SendAsync(HttpMethod.Put, playing ? "/me/player/pause" : "/me/player/play", token);
        return !playing;
    }

    public Task NextAsync(CancellationToken token) => SendAsync(HttpMethod.Post, "/me/player/next", token);

    public Task PreviousAsync(CancellationToken token) => SendAsync(HttpMethod.Post, "/me/player/previous", token);

    public async ValueTask DisposeAsync()
    {
        _http.Dispose();
        _refreshGate.Dispose();
        await Task.CompletedTask;
    }

    // --- Flujo OAuth ---

    private static string BuildAuthorizeUrl(string clientId, string challenge, string state) =>
        AuthorizeEndpoint +
        $"?client_id={Uri.EscapeDataString(clientId)}" +
        "&response_type=code" +
        $"&redirect_uri={Uri.EscapeDataString(RedirectUri)}" +
        $"&scope={Uri.EscapeDataString(string.Join(' ', Scopes))}" +
        $"&state={Uri.EscapeDataString(state)}" +
        "&code_challenge_method=S256" +
        $"&code_challenge={Uri.EscapeDataString(challenge)}";

    private async Task<SpotifyLink> ExchangeCodeAsync(string clientId, string code, string verifier, CancellationToken token)
    {
        using var content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = RedirectUri,
            ["client_id"] = clientId,
            ["code_verifier"] = verifier
        });

        using var response = await _http.PostAsync(TokenEndpoint, content, token);
        var body = await response.Content.ReadAsStringAsync(token);
        if (!response.IsSuccessStatusCode)
        {
            AppLog.Warn($"Spotify rechazó el código ({response.StatusCode}): {Truncate(body, 200)}");
            throw new SpotifyException("Spotify no aceptó el código de autorización. Revisá que el Redirect URI del panel coincida con " + RedirectUri);
        }

        return ParseTokenResponse(body, "", "", null, null);
    }

    private static SpotifyLink ParseTokenResponse(
        string body,
        string previousRefresh,
        string previousScope,
        string? displayName,
        string? accountId)
    {
        using var document = JsonDocument.Parse(body);
        var root = document.RootElement;

        var accessToken = GetString(root, "access_token") ?? throw new SpotifyException("Spotify no devolvió un access_token.");
        var refreshToken = GetString(root, "refresh_token");
        if (string.IsNullOrWhiteSpace(refreshToken)) refreshToken = previousRefresh;
        if (string.IsNullOrWhiteSpace(refreshToken)) throw new SpotifyException("Spotify no devolvió un refresh_token.");

        var expiresIn = root.TryGetProperty("expires_in", out var expires) && expires.TryGetInt32(out var seconds) ? seconds : 3600;
        var scope = GetString(root, "scope") ?? previousScope;

        return new SpotifyLink(
            accessToken,
            refreshToken!,
            DateTimeOffset.UtcNow.AddSeconds(expiresIn),
            scope,
            displayName,
            accountId);
    }

    /// <summary>Nombre de la cuenta, solo para mostrarlo en el panel.</summary>
    private async Task<(string Name, string Id)?> TryGetProfileAsync(string accessToken, CancellationToken token)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, ApiBase + "/me");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            using var response = await _http.SendAsync(request, token);
            if (!response.IsSuccessStatusCode) return null;
            var body = await response.Content.ReadAsStringAsync(token);
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            return (GetString(root, "display_name") ?? GetString(root, "id") ?? "", GetString(root, "id") ?? "");
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or TaskCanceledException)
        {
            return null;
        }
    }

    // --- Web API ---

    /// <summary>Llamada autenticada a la Web API; renueva el token una vez ante un 401.</summary>
    private async Task<JsonElement?> SendAsync(HttpMethod method, string path, CancellationToken token, bool allowRetry = true)
    {
        var accessToken = await GetAccessTokenAsync(token);

        using var request = new HttpRequestMessage(method, ApiBase + path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await _http.SendAsync(request, token);

        if (response.StatusCode == HttpStatusCode.Unauthorized && allowRetry)
        {
            // Token revocado en otro lado: forzamos un refresh y reintentamos.
            _link = _link is null ? null : _link with { ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1) };
            return await SendAsync(method, path, token, allowRetry: false);
        }

        if (response.StatusCode == HttpStatusCode.NoContent) return null;

        var body = await response.Content.ReadAsStringAsync(token);
        if (!response.IsSuccessStatusCode)
        {
            throw new SpotifyException(DescribeApiError(response.StatusCode, body));
        }

        if (string.IsNullOrWhiteSpace(body)) return null;

        using var document = JsonDocument.Parse(body);
        return document.RootElement.Clone();
    }

    private static string DescribeApiError(HttpStatusCode status, string body) => status switch
    {
        HttpStatusCode.Forbidden => "Spotify rechazó la acción: controlar la reproducción requiere una cuenta Premium.",
        HttpStatusCode.NotFound => "No hay un dispositivo activo. Abrí Spotify en la PC o el celular y probá de nuevo.",
        HttpStatusCode.TooManyRequests => "Spotify recibió demasiadas solicitudes seguidas. Esperá unos segundos.",
        HttpStatusCode.BadRequest => "Spotify rechazó la acción (revisá el dispositivo activo).",
        _ => $"Spotify devolvió un error {(int)status}: {Truncate(body, 160)}"
    };

    // --- Persistencia cifrada ---

    private SpotifyLink? LoadLink()
    {
        try
        {
            if (!File.Exists(_tokensPath)) return null;
            var protectedValue = File.ReadAllText(_tokensPath).Trim();
            if (protectedValue.Length == 0) return null;

            var json = Dpapi.Unprotect(protectedValue);
            if (json is null)
            {
                AppLog.Warn("spotify.tokens no se pudo descifrar con DPAPI (¿otro usuario de Windows?).");
                return null;
            }

            return JsonSerializer.Deserialize<SpotifyLink>(json, JsonOptions);
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException or FormatException)
        {
            AppLog.Warn($"No se pudieron leer los tokens de Spotify: {ex.Message}");
            return null;
        }
    }

    private async Task SaveLinkAsync(SpotifyLink link)
    {
        var protectedValue = Dpapi.Protect(JsonSerializer.Serialize(link, JsonOptions))
            ?? throw new SpotifyException("Windows no pudo cifrar los tokens de Spotify.");

        Directory.CreateDirectory(_dataDir);
        var temp = _tokensPath + ".tmp";
        await File.WriteAllTextAsync(temp, protectedValue);
        File.Move(temp, _tokensPath, true);
        _link = link;
    }

    private string? ReadClientId()
    {
        try
        {
            if (!File.Exists(_clientIdPath)) return null;
            var value = File.ReadAllText(_clientIdPath).Trim();
            return value.Length == 0 ? null : value;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    private static async Task StopQuietlyAsync(WebApplication app, CancellationToken token)
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
            timeout.CancelAfter(TimeSpan.FromSeconds(3));
            await app.StopAsync(timeout.Token);
        }
        catch (Exception ex) when (ex is OperationCanceledException or ObjectDisposedException)
        {
            // El listener ya no importa: la vinculación terminó.
        }
    }

    // --- Utilidades ---

    private static string CreateRandomString(int bytes) =>
        Base64Url(RandomNumberGenerator.GetBytes(bytes));

    private static string Base64Url(byte[] value) =>
        Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static string? GetString(JsonElement element, string property) =>
        element.ValueKind == JsonValueKind.Object &&
        element.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static string Truncate(string value, int max) =>
        string.IsNullOrEmpty(value) ? "" : value.Length <= max ? value : value[..max];

    private static string HtmlPage(string title, string message, bool ok) => $@"<!doctype html>
<html lang=""es"">
<head>
<meta charset=""utf-8"">
<meta name=""viewport"" content=""width=device-width, initial-scale=1"">
<title>VexaDeck · Spotify</title>
<style>
  body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0c0f;color:#e6edf3;font-family:'Segoe UI',system-ui,sans-serif}}
  main{{max-width:430px;margin:24px;padding:36px 30px;border:1px solid {(ok ? "#1c382c" : "#3a2026")};border-radius:14px;background:#12161b;text-align:center}}
  .mark{{display:grid;place-items:center;width:56px;height:56px;margin:0 auto 18px;border-radius:50%;background:{(ok ? "#163126" : "#2a161a")};color:{(ok ? "#00ff9c" : "#ff5c6d")};font-size:26px}}
  h1{{margin:0 0 10px;font-size:21px;font-weight:600}}
  p{{margin:0;color:#8d9a91;font-size:13px;line-height:1.65}}
</style>
</head>
<body>
  <main>
    <div class=""mark"">{(ok ? "&#10003;" : "!")}</div>
    <h1>{WebUtility.HtmlEncode(title)}</h1>
    <p>{WebUtility.HtmlEncode(message)}</p>
  </main>
</body>
</html>";
}
