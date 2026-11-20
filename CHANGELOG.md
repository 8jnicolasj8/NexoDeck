# Changelog

Todos los cambios notables en este proyecto serán documentados en este archivo.
El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/) y se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [1.1.0] - 2026-11-20

### Agregado
- **Integración con Spotify**: vinculación de la cuenta desde el panel con OAuth 2.0 + PKCE (sin Client Secret), callback en `http://127.0.0.1:47810/callback`, tokens cifrados con DPAPI y renovación automática del `access_token`.
- **Acción de botonera `spotify`**: reproducir/pausa, siguiente y anterior sobre la cuenta vinculada, disponible también en el editor de acciones.
- **Tarjeta de integración en el panel**: guarda el Client ID, muestra la cuenta conectada y la canción actual, y permite desconectar.

### Cambiado
- Servidor, PWA, app Android, instalador, portable y landing pasan a **1.1.0**. El APK usa `versionCode` 1100.

## [1.0.0] - 2026-11-19

### Agregado
- **VexaDeck**: el proyecto se renombra de NexoDeck a VexaDeck. Nueva identidad visual, logo, instalador y nombres de artefactos.
- **Nueva identidad de app**: paquete Android `app.vexadeck.android`, scheme `vexadeck://`, servicio mDNS `_vexadeck._tcp` y claves de almacenamiento `vexadeck.*`.
- **Migración de datos**: el servidor copia `%APPDATA%\NexoDeck` a `%APPDATA%\VexaDeck` en el primer arranque; la PWA migra las claves `nexodeck_*` a `vexadeck_*`.
- **Instalador limpio**: nuevo AppId de Inno Setup para convivir con la instalación anterior sin pisarla.

### Cambiado
- Servidor, PWA, app Android, instalador, portable y landing pasan a **1.0.0**. El APK usa `versionCode` 1000.
- El repositorio pasa a `8jnicolasj8/VexaDeck` y el sitio a `vexadeck-app.netlify.app`.
- La app Android anterior no se actualiza en sitio: al cambiar el `applicationId` hay que instalar VexaDeck y emparejar de nuevo.

### Corregido
- **Conexión Android estable**: la app firmaba los mensajes con la dirección equivocada y el servidor cerraba el socket al instante. Ahora cada dirección usa su propia firma y se evitan conexiones duplicadas.
- **Emparejamiento Android**: los bytes aleatorios vienen del generador seguro del sistema, no de `crypto.getRandomValues`.

### Nota histórica
Las entradas siguientes pertenecen a la etapa anterior del proyecto (NexoDeck). Se conservan como referencia y sus nombres se actualizaron a VexaDeck.

<details>
<summary>Historial anterior (etapa NexoDeck)</summary>

## [1.0.3] - 2026-11-19

### Corregido
- **Conexión Android inestable**: la app firmaba cada mensaje saliente con la dirección `s2c` en vez de `c2s`, así que el servidor lo rechazaba y cerraba el socket apenas se conectaba. La app entraba en un ciclo de conectar/desconectar y no dejaba usar la botonera. Ahora usa un canal firmado por dirección.
- **Conexiones duplicadas**: se bloquean los intentos simultáneos y una conexión reemplazada ya no marca la nueva como caída. Al pasar a segundo plano se cancelan también los pings pendientes.

### Cambiado
- Servidor, PWA, app Android, instalador, portable y landing pasan a **1.0.3**. El APK sube a `versionCode` 1003.

## [1.0.2] - 2026-11-19

### Corregido
- **Emparejamiento Android**: el celular ya puede generar el nonce de seguridad. `@noble/hashes` usaba `crypto.getRandomValues`, que no existe en Hermes; ahora los bytes aleatorios vienen de `expo-crypto` (el generador del sistema). El error `crypto.getRandomValues must be defined` aparecía al escanear el QR o pegar el enlace.

### Cambiado
- Servidor, PWA, app Android, instalador, portable y landing pasan a **1.0.2**. El APK sube a `versionCode` 1002.

## [1.0.1] - 2026-11-19

### Corregido
- Guardar la configuración ya no devuelve los botones de Spotify a su posición original. El servidor solo siembra los perfiles de fábrica cuando faltan; si existen, respeta los cambios del usuario.
- Los botones de Spotify se pueden mover, editar y eliminar como los de cualquier otro perfil. Se quitó la marca de perfil bloqueado y el candado del panel de perfiles.

### Cambiado
- Servidor, PWA, app Android, instalador, portable y landing pasan a **1.0.1**. El APK sube a `versionCode` 1001.
- Se agregó una prueba de regresión que mueve y elimina botones de Spotify y Gamer, guarda y verifica que los cambios sigan ahí.

## [1.0.0] - 2026-11-19

### Agregado
- **Perfil Gamer**: se activa solo cuando la app en primer plano parece un juego. Revisa la biblioteca detectada (Steam, Epic, `D:\Games`, etc.) o la pantalla completa de Direct3D, y excluye navegadores, launchers y reproductores.
- **Perfil Spotify fijo**: muestra la canción actual con carátula y una botonera compacta; el servidor lo restaura en cada guardado para que no se desconfigure.
- **Perfiles opcionales**: Spotify y Gamer se pueden quitar y volver a agregar desde Perfiles, y la elección se recuerda.

### Cambiado
- Servidor, PWA, app Android, instalador, portable y landing pasan a **1.0.0**. El APK sube a `versionCode` 1000.
- `installer/build.ps1` borra de `dist/` los instaladores y zips de versiones anteriores y le pasa la versión al compilador de Inno Setup, para que el `.exe`, el `.zip` y el panel no se desincronicen.

### Corregido
- Apagar y reiniciar ya no fallan en silencio: usan la ruta completa de `shutdown.exe`, reintentan por shell y devuelven el error al celular.

### Compatibilidad
- El instalador conserva la carpeta de datos existente (`config.json`, certificados, dispositivos y perfiles) si no se borró a mano. No hace falta volver a emparejar el celular.
- La PWA y el iPhone siguen funcionando con el protocolo v1 sin cambios.

## [0.3.0] - 2026-11-18

### Agregado
- **App Android nativa** (`mobile/`, Expo + Kotlin): shell con WebView que empaqueta el mismo cliente web, protocolo v2 firmado y conexión directa por `ws://` sin instalar certificados.
- **Varias PCs**: hasta cinco conexiones simultáneas y una activa. Chip de PC en la barra superior, hoja "Mis PCs", swipe para cambiar, caché por PC y alertas de PCs en segundo plano.
- **Conexión por USB**: `adb reverse` desde el panel (opt-in), con instalación del APK y emparejamiento por cable. ADB solo se descarga si el usuario lo pide.
- **Descubrimiento automático**: `/api/ident`, responder mDNS `_vexadeck._tcp` y barrido de subred bajo demanda para encontrar la PC cuando cambia la IP.
- **Wake-on-LAN**: la app enciende la PC apagada con un magic packet desde Android; el panel muestra la MAC, permite probar el paquete y documenta los requisitos de BIOS/Windows.
- **Esta PC**: `serverId` estable, nombre, color e ícono editables, con botón para regenerar la identidad.
- **Emparejamiento con dos pestañas** en el panel: "Android (app)" (QR v2 + enlace copiable) e "iPhone / navegador" (QR v1).
- **Vectores compartidos** `docs/protocol-v2-vectors.json` verificados por C# (`--verify-v2`) y por Jest.
- **Documentación**: `docs/ANDROID.md`, `docs/PRUEBAS.md`, `docs/IDEAS.md` y protocolo v2 en `docs/PROTOCOLO.md`.
- **Workflow** `release-android.yml` para compilar y firmar el APK en cada tag.

### Cambiado
- `config.json` sube a versión 3 (identidad de la PC, `revision`, dispositivos v2 con clave protegida por DPAPI). La migración es automática.
- El cliente web pasa a una capa de transporte (`BrowserTransport` / `NativeTransport`) y el store indexa el estado por `serverId`.
- Los diálogos de apagado/reinicio incluyen el nombre de la PC y los toques se ignoran durante 250 ms al cambiar de PC.
- Proyecto, instalador, PWA, app y landing suben a **0.3.0**. El instalador agrega la regla de firewall UDP 5353 para mDNS.
- La landing muestra la app Android, Wake-on-LAN, multi-PC y la conexión USB.

### Corregido
- El workflow de Android vuelve a compilar el APK: el plugin de assets se resuelve como CommonJS y `acquireMulticast` declara el tipo de retorno que espera Expo.
- `installer/build.ps1` publica `SHA256SUMS.txt` para el instalador y el portable; el workflow de Android espera ese archivo, le agrega el APK y publica un único listado combinado.
- El servidor arranca en una instalación nueva aunque todavía no exista `config.json`; si el archivo falta, cae al respaldo o a la configuración por defecto.
- El APK sin keystore propio se compila como release firmado con la clave de depuración, para que incluya el bundle y se instale sin Metro.

### Compatibilidad
- La PWA y el iPhone siguen funcionando con el protocolo v1 sin cambios.
- `/admin` sigue accesible solo desde `127.0.0.1:47802`.

## [0.2.1] - 2026-11-18

### Agregado
- **Navegación en la botonera**: flechas para cambiar de página y de perfil desde el celular, sin volver al panel (`DeckNav`).
- **Cambio de perfil sin fijar**: elegir un perfil desde el celular es temporal; el auto-switching retoma al cambiar de app. Disponible por WebSocket (`profile.select`) y como acciones del panel (`profile.switch`, `profile.next`, `profile.prev`).
- **Acciones de página**: `page.next`, `page.prev` y `page.goto`, para moverte entre páginas con cualquier botón.
- **Landing pública**: página de presentación con funciones, requisitos, privacidad y descargas directas al último release.

### Cambiado
- Proyecto, instalador, paquete portable y panel suben a **0.2.1**.
- El paquete portable toma la versión del proyecto al empaquetarse, así el `.zip`, el instalador y el panel no se desincronizan.
- El mensaje de bienvenida por WebSocket informa la versión real del servidor en lugar de un valor fijo.

## [0.2.0] - 2026-11-17

### Agregado
- **M1**: Registro central de esquemas de acción (`shared/actionSchemas.json`), consumido por el servidor y por el panel. El editor de botones se renderiza 100 % a partir de él, sin formularios por tipo de acción.
- **M1**: Controles de parámetro `select`, `text`, `textarea`, `number`, `checkbox`, `hotkey` (presets agrupados + grabador), `process-picker`, `app-picker`, `audio-device-picker`, `script-picker`, `page-picker` y `profile-picker`.
- **M1**: El `statebinding` se deduce de la acción y solo se muestra en modo lectura; el tipo "Interruptor" deja de ofrecerse cuando la acción no tiene estado.
- **M1**: Migración de configuración v1 → v2 con backup automático (`config.bak.json`), validación de parámetros obligatorios y aviso "Valor anterior no válido" para valores legacy.
- **M1**: Selector de ícono con pestañas **Automático**, **Biblioteca** (Lucide con búsqueda) e **Imagen propia** (PNG/ICO/SVG o extraído de `.exe`/`.lnk`).
- **M2**: Acciones de portapapeles `clipboard.copy`, `clipboard.cut`, `clipboard.paste`, `clipboard.paste_plain` y `clipboard.snippet` (con restauración del texto previo, Enter opcional y accesos en hilo STA con reintentos).
- **M3**: Arrastrar y soltar botones en la grilla del panel: mover a celda vacía, intercambiar con celda ocupada y soltar sobre una pestaña de página. Resaltado del destino con el acento del perfil, guardado inmediato, aviso "Botón movido · Deshacer" (6 s) y `Ctrl+Z`.
- **M3**: Sensor de teclado en la grilla (Espacio levanta, flechas mueven, Enter suelta) y diálogo de confirmación al reducir la grilla para reubicar botones fuera de rango.
- **M4**: Logos reales de apps mediante `IShellItemImageFactory` (PNG 128×128 con transparencia, servidos por hash con caché inmutable) y selector de aplicaciones con Menú Inicio, apps de la Tienda (`shell:AppsFolder`), apps en ejecución y "Examinar…".
- **M5**: Cerrar la ventana a la bandeja destruye el control WebView2 (0 procesos `msedgewebview2.exe`), suspensión al minimizar (`MemoryUsageTargetLevel` + `TrySuspendAsync`), una única recolección al cerrar y recorte del working set.
- **M5**: Servidor más liviano (GC de estación de trabajo, sin GC concurrente, sin TieredPGO, `System.GC.ConserveMemory=3`); LibreHardwareMonitor abre solo CPU y GPU; un cliente lento descarta telemetría atrasada en lugar de acumularla.
- **M5**: `tools/measure-ram.ps1` y tabla de memoria antes/después en `docs/RENDIMIENTO.md`.

### Cambiado
- El panel muestra la versión real del servidor en "Sistema → Versión" (leída de `/api/health`, que ahora la toma del ensamblado).
- Proyecto, instalador, paquete portable y panel suben a **0.2.0**.
- Los botones `launch` de la v0.1.0 conservan su `path` y reciben el ícono de la app automáticamente al migrar.

## [0.1.0] - 2026-11-16

### Agregado
- **M1**: Servidor Kestrel en .NET 8 con listeners HTTP (47801), HTTPS (47800) y Loopback Admin (47802). Bandeja del sistema (NotifyIcon) e instancia única mediante `/api/health`.
- **M2**: Autoridad Certificadora (CA) local con generación dinámica de certificados SAN para IPs locales. Emparejamiento seguro mediante código QR de un solo uso.
- **M3**: Monitor de telemetría de hardware pasivo con LibreHardwareMonitor (CPU, GPU, RAM, red). Cliente móvil base en React/Vite/Tailwind con 4 slots de telemetría configurables y diseño adaptable.
- **M4**: Ejecución de atajos de teclado (`SendInput`), teclas multimedia, control de volumen maestro y por aplicación (WASAPI), mutear y cambio de salidas de audio.
- **M5**: Detección en tiempo real de la ventana activa en Windows (`SetWinEventHook`) con auto-switching de perfiles, extracción y servicio de íconos `.exe`, y fijado manual.
- **M6**: Portapapeles bidireccional PC ↔ Celular con historial en memoria, widget Now Playing (GSMTC), acciones seguras de energía (apagar con confirmación) y ejecución de scripts `.vbs` con lista blanca.
- **M7**: Panel de configuración integral en WebView2 con editor visual de grillas, modal de edición de botones, vinculación de procesos y exportación/importación de `config.json`.
- **M8**: Alertas hápticas de temperatura (>85°C), animación de arranque tipo terminal, atenuación automática por inactividad, modo OLED, modo reordenar botones desde el celular y soporte PWA.
- **M9**: Script de instalación Inno Setup 6 (`installer/VexaDeck.iss`), empaquetador automático (`installer/build.ps1`), distribución portable `.zip` y documentación completa.

</details>
