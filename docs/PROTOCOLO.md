# Especificación del Protocolo WebSocket (NexoDeck v1)

La comunicación en tiempo real entre el servidor PC y el cliente móvil se realiza a través de WebSockets en formato JSON estructurado.

## Estructura base de los mensajes

Todos los mensajes contienen un sobre (*envelope*) común:

```json
{
  "v": 1,
  "t": "<tipo_de_mensaje>",
  "id": "<identificador_opcional_de_correlacion>",
  "d": { ... }
}
```

- `v` (entero): Versión del protocolo (actualmente `1`).
- `t` (string): Tipo de mensaje o evento.
- `id` (string, opcional): Identificador para emparejar solicitud con respuesta.
- `d` (objeto): Payload con los datos específicos del mensaje.

---

## 1. Conexión y Autenticación

### Cliente → Servidor: `hello`
Enviado inmediatamente al abrir el socket WebSocket.

```json
{
  "v": 1,
  "t": "hello",
  "d": {
    "token": "d7a8f9c0e1b2...",
    "deviceName": "Celular Android",
    "clientVersion": "0.1.0"
  }
}
```

### Servidor → Cliente: `welcome`
Respuesta exitosa a la autenticación.

```json
{
  "v": 1,
  "t": "welcome",
  "d": {
    "config": { ... },
    "activeProfileId": "global",
    "pinned": false,
    "states": { "mic.muted": false, "audio.muted": false },
    "clipboard": "Último texto copiado",
    "nowPlaying": { ... },
    "serverVersion": "0.1.0"
  }
}
```

---

## 2. Telemetría y Monitoreo

### Servidor → Cliente: `telemetry`
Difundido periódicamente (por defecto cada 1000 ms) a todos los clientes no pausados.

```json
{
  "v": 1,
  "t": "telemetry",
  "d": {
    "ts": 1731792000000,
    "m": {
      "cpu.load": 14.5,
      "cpu.temp": 52.0,
      "ram.used": 68.2,
      "ram.used_gb": 10.9,
      "gpu.load": 22.0,
      "gpu.temp": 49.0,
      "net.down": 1048576,
      "net.up": 65536,
      "ping.app": 12
    }
  }
}
```

---

## 3. Acciones de Botón

### Cliente → Servidor: `action`
Disparado al tocar un botón del deck.

```json
{
  "v": 1,
  "t": "action",
  "d": {
    "buttonId": "b1",
    "value": true
  }
}
```

El servidor busca la definición de `b1` en `config.json` y ejecuta la acción correspondiente (`hotkey`, `media`, `mute.toggle`, `launch`, `script.run`, etc.).

---

## 4. Perfiles y Reordenamiento

### Servidor → Cliente: `profile.changed`
Notifica un cambio en el perfil activo debido al auto-switching por foco de ventana.

```json
{
  "v": 1,
  "t": "profile.changed",
  "d": {
    "profileId": "vscode",
    "pinned": false
  }
}
```

### Cliente → Servidor: `profile.pin`
Fija o des-fija manualmente el perfil actual.

```json
{
  "v": 1,
  "t": "profile.pin",
  "d": {
    "profileId": "vscode"
  }
}
```

### Cliente → Servidor: `layout.reorder`
Envía la nueva disposición de botones tras reordenarlos desde el celular.

```json
{
  "v": 1,
  "t": "layout.reorder",
  "d": {
    "profileId": "global",
    "pageId": "p1",
    "buttons": [ ... ]
  }
}
```

### Servidor → Todos: `config.updated`
Notifica a todos los clientes conectados que la configuración cambió en el servidor.

```json
{
  "v": 1,
  "t": "config.updated",
  "d": {
    "config": { ... }
  }
}
```

---

## Protocolo v2 (v0.3.0)

La app Android usa `/ws2` con mensajes firmados. La PWA y el iPhone siguen con
`/ws` (v1) sin cambios: los dos protocolos conviven en paralelo.

### Identificación

`GET /api/ident` en 47801 (plano) y 47800 (TLS), sin autenticación y con rate
limit de 120 req/min por IP:

```json
{
  "app": "nexodeck",
  "serverId": "3f1c…",
  "pcName": "PC-Escritorio",
  "pcColor": "#00FF9C",
  "pcIcon": "monitor",
  "version": "1.0.3",
  "protocol": [1, 2],
  "addresses": ["192.168.1.20"],
  "httpPort": 47801,
  "httpsPort": 47800,
  "mac": "AA-BB-CC-DD-EE-FF",
  "wolPort": 9,
  "wake": true
}
```

No incluye perfiles, dispositivos ni tokens. La MAC se publica porque la app la
necesita para Wake-on-LAN cuando la PC está apagada.

### Emparejamiento (`pair2`)

1. Panel → Emparejar → **Android (app)** genera un `pairSecret` de 16 bytes,
   de un solo uso, válido 5 minutos.
2. El QR y el enlace contienen
   `nexodeck://pair?v=2&sid=…&name=…&color=…&addr=…&port=47801&s=…&exp=…&mac=…`.
3. La app abre `/ws2` y envía `pair2` en claro con
   `proof = HMAC(pairSecret, "pair|serverId|deviceId|nonceC")`.
4. El servidor consume el secreto, responde `pair2ok` con `nonceS` y guarda
   `deviceKey` protegida con DPAPI (ámbito del usuario actual).
5. Ambos derivan, sin transmitirla,
   `deviceKey = HKDF-SHA256(pairSecret, salt=deviceId, info="nexodeck-device-key|serverId|nonceC|nonceS", 32)`.

### Sesión (`hello2`)

`hello2` → `challenge` → `auth` con
`proof = HMAC(deviceKey, "auth|serverId|nonceS|nonceC")`; luego
`sessionKey = HMAC(deviceKey, "sess|serverId|nonceS|nonceC")`.

Desde ahí cada mensaje viaja en un sobre:

```json
{ "n": 1, "p": "<mensaje JSON como string>", "m": "<MAC base64url>" }
```

`m = HMAC-SHA256(sessionKey, dir + "|" + n + "|" + p)` truncado a 16 bytes,
`dir` = `c2s` o `s2c`. El contador arranca en 1 por sentido y debe ser
exactamente el anterior + 1: un MAC inválido, repetido o salteado cierra la
conexión con `4401`. El primer mensaje del servidor es `welcome`: que su MAC
valide es la prueba de que la PC conoce la clave (autenticación mutua).

### Mensajes agregados

| Dirección | `t` | `d` |
|---|---|---|
| S→C | `welcome` | agrega `serverId, pcName, pcColor, pcIcon, configRevision, protocol, caps` |
| S→C | `config.updated` | agrega `configRevision` |
| C→S | `resync` | `{}` — devuelve un `welcome` completo sin reautenticar |
| C→S | `view` | `{ "active": true\|false }` — pausa telemetría de esa PC sin dejar de recibir alertas y cambios de perfil |
| S→C | `action.ok` | `{ pcName }` — la app lo usa en el diálogo de apagado |

### Vectores

`docs/protocol-v2-vectors.json` fija secretos, nonces y los valores esperados
de `pairProof`, `deviceKey`, `authProof`, `sessionKey` y dos MACs. Lo verifican
los dos lados:

- C#: `NexoDeck.Server.exe --verify-v2 docs/protocol-v2-vectors.json` (exit 0).
- Android: `npm test` en `mobile/` (Jest).

Para regenerar los vectores: `node tools/generate-v2-vectors.mjs`.
