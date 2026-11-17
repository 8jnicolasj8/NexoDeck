# Especificación del Protocolo WebSocket (OpenDeck v1)

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
