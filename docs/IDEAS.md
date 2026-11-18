# Ideas para después de la v0.3.0

Anotadas para no perderlas, **fuera del alcance** de esta versión.

## App Android

- **Servicio en segundo plano** con notificación persistente para no cortar la conexión al salir. Hoy se cierran los sockets a los 60 s en segundo plano.
- **Widgets de Android** (quick settings tile / widget de pantalla) con 4 botones del perfil activo.
- **Notificaciones locales** cuando una PC inactiva dispara una alerta, sin abrir la app.
- **Importar/exportar** la lista de PCs (QR de "mi configuración") para pasar de celular sin re-emparejar una por una.
- **Modo tableta**: grilla más densa y panel lateral en horizontal.

## Escritorio

- **Auto-actualización firmada** (descarga del release + verificación de hash + reinicio).
- **Encendido remoto fuera de la LAN**: hoy WoL es solo broadcast local. Un relay pequeño en otra PC encendida podría reenviar el magic packet.
- **Perfiles por horario** además del auto-switching por proceso.
- **Métricas por proceso** (CPU/RAM de la app enfocada) como slots de telemetría.
- **Historial de acciones** con "deshacer" para las últimas N pulsaciones.

## Producto y distribución

- **Google Play**: AAB + ficha, cuando el nombre y la política de privacidad estén cerrados.
- **Firma de código** del instalador de Windows (evita SmartScreen).
- **Telemetría de uso opt-in y anónima** para priorizar funciones (nunca por defecto).
- **Página de descargas propia** con checksums y notas de versión, en vez de depender de GitHub Releases.
- **Video de instalación de 60 s** y capturas del panel para la landing.

## Protocolo

- **Cifrado real sobre ws://** con X25519 + ChaCha20-Poly1305 (hoy solo integridad y autenticación).
- **Emparejamiento por PIN corto** con límite de intentos y bloqueo temporal (hoy se descartó por el riesgo de fuerza bruta offline; con rate limit estricto y expiración corta sería viable).
- **Revancha de claves** (rotación de `deviceKey` cada N días).
