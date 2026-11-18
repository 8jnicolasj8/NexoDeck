# Changelog

Todos los cambios notables en este proyecto serán documentados en este archivo.
El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/) y se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

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
- **M9**: Script de instalación Inno Setup 6 (`installer/OpenDeck.iss`), empaquetador automático (`installer/build.ps1`), distribución portable `.zip` y documentación completa.
