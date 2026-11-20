# Decisiones de implementación

## 2026-11-17 — v0.2.0

### M3: arrastrar y reposicionar sin `@dnd-kit`
El editor de grillas del panel es JavaScript vanilla alojado en `wwwroot/`, no React: usar
`@dnd-kit` habría exigido portar el editor completo a la app Vite. Se implementó con
Pointer Events (umbral de 6 px con mouse, pulsación larga de 150 ms en táctil), un clon
con `position: fixed` que hace de `DragOverlay` y las mismas reglas de `gridRules.js`
que el servidor replica en `GridService`. La API queda igual: mover, intercambiar,
rechazar si no cabe y resaltar el destino.

### M3: guardado y deshacer
Cada movimiento se persiste con `POST /api/admin/config` (escritura atómica por archivo
temporal + `File.Move` y backup `config.bak.json` en `ConfigService.Save`) y el servidor
difunde `config.updated` para que el celular se actualice sin reconectar. El deshacer
vive en memoria del panel: pila de hasta 20 copias de las páginas del perfil activo.

### M5: `InvariantGlobalization` no se activó
El resto de E2 se aplicó y midió, pero `InvariantGlobalization` quedó en `false`:
`AppCatalogService` ordena con `StringComparer.CurrentCultureIgnoreCase` y la UI y los
logs formatean fechas y números en español. El servidor idle quedó en 8,8 MB, así que la
ganancia potencial no justificaba el riesgo de cambiar textos y ordenamientos.

### M5: `System.GC.ConserveMemory=3`
Se eligió el valor bajo del rango sugerido (3–5). VexaDeck prioriza la latencia de
actions (< 50 ms) sobre el último megabyte: valores más agresivos ceden CPU al GC.

### M5: E4 acotado a lo que aporta
La telemetría se serializa una vez por tick para todos los clientes y cada cliente omite
el frame si el anterior sigue en vuelo (descarta lo atrasado en vez de acumularlo). No se
reemplazó la serialización por `Utf8JsonWriter` con buffers propios: el payload ronda los
300 bytes por segundo y el cambio no aportaba memoria pero sí riesgo sobre el protocolo.

### M5: el entorno de WebView2 se libera con el control
`CoreWebView2Environment` no expone `Dispose` en el SDK 1.0.4314.35. Al destruir el
control se libera `CoreWebView2` y el entorno nativo se cierra con él; el
`UserDataFolder` se conserva para no perder estado al reabrir.

## 2026-11-16

### M1 & M2: Esqueleto, Red Local y Certificados

- El panel de escritorio usa una sola UI web alojada por Kestrel y embebida mediante WebView2 sin duplicar código nativo.
- El puerto 47801 limita las conexiones a rangos privados y loopback; el 47802 escucha solo en loopback. El panel de administración se bloquea por IP en los puertos LAN con `403 Forbidden`.
- Autoridad Certificadora (CA) local creada mediante `CertificateService` con exportación de `ca.crt` y generación dinámica de certificados de servidor con Subject Alternative Name (SAN) para todas las IPs locales detectadas.
- Emparejamiento por código QR de un solo uso con 5 minutos de validez. Tokens almacenados únicamente como hash SHA-256.

### M3: Telemetría y Cliente Base PWA

- Telemetría implementada con LibreHardwareMonitor en C# para CPU/GPU y contadores de red pasivos vía `NetworkInterface.GetIPv4IPv6Statistics()`.
- Cliente móvil desarrollado con React 18, Vite, TypeScript y Tailwind CSS, con soporte para layout horizontal (4x3 + 2 medidores por lado) y vertical (2x2 arriba + 3x4).

### M4: Acciones, Atajos y Audio

- Simulación de teclas físicas mediante `SendInput` con soporte para hotkeys complejas (`ctrl+shift+esc`, `win+d`, etc.) y texto Unicode arbitrario.
- Control de audio WASAPI con NAudio: volumen maestro y mutear con callback en tiempo real (`AudioEndpointVolumeNotificationDelegate`) para sincronización bidireccional.

### M5: Detección y Cambio Automático de Perfiles

- Detección de ventana activa mediante hook nativo `SetWinEventHook(EVENT_SYSTEM_FOREGROUND)` con debounce de 150 ms para evitar sobrecarga.
- Manejo especial de apps UWP: cuando la ventana principal pertenece a `ApplicationFrameHost.exe`, se enumera la jerarquía de ventanas hijas con `EnumChildWindows` para obtener el proceso real.
- Servicio de íconos (`IconService`): extracción de íconos de ejecutables en formato PNG 128x128 con caché por hash SHA-256 en `<DataDir>\icons\`.

### M6: Utilidades y Seguridad

- Portapapeles bidireccional con listener Win32 `AddClipboardFormatListener` alojado en un hilo STA en segundo plano sin ventana visible. Historial limitado a 10 entradas y solo en memoria (nunca se escribe a disco).
- Integración con Windows Media Controls (GSMTC) para widget _Now Playing_ y extracción de carátula de álbum.
- Ejecución estricta de scripts: whitelist limitada a archivos `.vbs` dentro de `<DataDir>\scripts\` y validación anti-path traversal con `Path.GetFullPath`.

### M7: Panel de Configuración

- Panel visual interactivo con editor de grilla, selector de páginas, modal de edición de botones, vinculación rápida de procesos a perfiles y exportación/importación de `config.json`.
- Notificación reactiva: todo cambio guardado en el admin emite un broadcast `config.updated` sobre WebSocket a todos los clientes móviles conectados.

### M8: Pulido, Alertas y OLED

- Alertas de temperatura de CPU y GPU (>85°C) con pulso visual rojo y vibración de alta intensidad con cooldown de 30 segundos.
- Modo OLED con fondo `#000` y atenuación de pantalla por inactividad tras 1, 3 o 5 minutos con despertar al primer toque sin ejecutar comandos.
- Modo reordenar botones desde el móvil mediante pulsación larga (600 ms) y animación de wobble.

### M9: Instalador y Empaquetado

- Script Inno Setup 6 (`installer/VexaDeck.iss`) para instalación desatendida con creación de reglas de firewall y tarea programada de inicio con privilegios elevados (`schtasks /rl highest`).
- Versión portable con detección de `portable.flag`.
- Script de automatización integral `installer/build.ps1` que compila frontend, publica backend y genera el instalador y zip portable.

---

## v0.3.0

- **App Android con Expo + WebView**: se reutiliza el cliente web dentro del APK en lugar de reescribir la UI en React Native. Todo lo nuevo del cliente aparece automáticamente en la app.
- **Red en la capa nativa**: el WebView no abre sockets; el bridge JSON es la única vía. Así el APK controla reconexión, USB y Wake-on-LAN.
- **`ws://` con mensajes firmados**: no se instala ninguna CA en el celular. Se acepta que el contenido no viaje cifrado y se documenta la limitación en README/SECURITY.
- **`applicationId` en un solo lugar**: `mobile/app.config.ts` exporta `APPLICATION_ID`.
- **mDNS sin dependencia**: se implementó un responder mínimo de `_vexadeck._tcp.local` en lugar de sumar una librería, para no crecer el instalador ni arriesgar incompatibilidades.
- **USB con ADB opt-in**: ADB nunca se redistribuye; se descarga solo si el usuario toca el botón, desde `dl.google.com`.
- **Wake-on-LAN desde la app** (pedido explícito del usuario, aunque el documento lo dejaba fuera de alcance): el magic packet lo envía el celular por UDP a los broadcasts locales, porque el servidor está apagado cuando hace falta. Requiere la MAC, que se entrega en el QR de emparejamiento.
- **Límite de 5 conexiones simultáneas**: la app conecta las primeras cinco PCs emparejadas; las demás quedan offline hasta que se las active.
- **Vectores compartidos**: en vez de un proyecto xUnit nuevo, la verificación C# vive en `--verify-v2` y se ejecuta con el mismo JSON que usa Jest.
- **USB Modo B (tethering) queda para 0.3.1**: el Modo A por ADB cubre el caso principal y no requiere activar el anclaje cada vez. El modo B necesita reglas de firewall por subred del adaptador RNDIS y pruebas en hardware variado.
- **El APK no se compiló en este entorno**: no hay Android SDK ni JDK 17 acá. El código, el workflow y la documentación quedan listos; el primer APK firmado sale del workflow `release-android` o de `docs/ANDROID.md`.
