# Arquitectura de OpenDeck

OpenDeck está diseñado como una solución 100% local dividida en dos componentes principales: el **Servidor de Escritorio Windows** y el **Cliente Móvil Web (PWA)**.

```mermaid
flowchart TD
    subgraph PC["PC Windows (OpenDeck.Server)"]
        subgraph Ports["Puertos Kestrel"]
            P47800["47800: HTTPS / WSS (LAN)"]
            P47801["47801: HTTP / Setup (LAN)"]
            P47802["47802: Loopback Admin (127.0.0.1)"]
        end

        subgraph Core["Servicios del Servidor"]
            Config["ConfigService (config.json)"]
            Cert["CertificateService (CA + SAN)"]
            Pairing["PairingService"]
            Watcher["ForegroundWatcher (WinEventHook)"]
            Resolver["ProfileResolver"]
            Telemetry["TelemetryService (LHM + Net)"]
            Audio["AudioService (WASAPI)"]
            Input["InputService (SendInput)"]
            Clipboard["ClipboardService (STA Hook)"]
            NowPlaying["NowPlayingService (GSMTC)"]
            Scripts["ScriptService (.vbs whitelist)"]
        end

        subgraph Host["Host Nativo"]
            Tray["TrayApplicationContext (NotifyIcon)"]
            WebView["WebView2 (Admin Panel)"]
        end
    end

    subgraph Mobile["Dispositivo Móvil (PWA)"]
        Browser["Navegador Móvil / PWA"]
        DeckStore["Zustand Store"]
        DeckSocket["DeckWebSocketClient"]
        Views["Vistas: DeckView, Utils, Perfiles, Ajustes"]
    end

    Browser <-->|WSS / HTTPS| P47800
    Browser <-->|HTTP Setup| P47801
    WebView <-->|Loopback HTTP| P47802

    P47800 <--> Core
    P47802 <--> Core
    Host --> Core
```

## Flujo de datos y eventos

1. **Arranque del servidor**:
   - Resuelve `DataDir` según la prioridad: argumento `--data-dir`, `portable.flag`, `bootstrap.json` o `%AppData%\OpenDeck`.
   - Consulta `http://127.0.0.1:47802/api/health` para garantizar instancia única. Si ya existe una instancia, solicita `POST /api/admin/show-window` y finaliza.
   - Genera la Autoridad Certificadora (CA) y el certificado de servidor con los Subject Alternative Names (SAN) de las IPs locales.
   - Inicia los listeners de Kestrel y el bucle de telemetría pasiva.
2. **Emparejamiento y conexión**:
   - El administrador muestra un código QR que apunta a `http://<IP>:47801/setup?code=...`.
   - El celular descarga e instala `ca.crt`, tras lo cual navega a `https://<IP>:47800/`.
   - El celular canjea el código en `POST /api/pair` y recibe un token criptográfico que almacena en `localStorage`.
   - Abre un WebSocket seguro a `wss://<IP>:47800/ws` enviando `hello` con el token.
   - El servidor valida el hash SHA-256 del token y responde con `welcome`, transmitiendo la configuración, estados iniciales de audio, perfil activo y estado de Now Playing.
3. **Auto-Switching de Perfiles**:
   - `ForegroundWatcher` escucha eventos `EVENT_SYSTEM_FOREGROUND` con debounce de 150 ms.
   - Resuelve el proceso de primer plano (incluyendo ventanas UWP hijas de `ApplicationFrameHost.exe`).
   - `ProfileResolver` busca el proceso en las listas `match.processes` de cada perfil.
   - Si cambia de perfil y no está fijado manualmente, emite el evento `profile.changed` a través de WebSocket.
4. **Telemetría y Alertas**:
   - `TelemetryService` muestrea métricas cada segundo sin generar I/O en disco.
   - El servidor difunde el payload `telemetry` con las métricas actuales a los clientes conectados.
   - Si la temperatura supera los 85°C, el cliente activa la animación de pulso y la vibración táctil configurada.
