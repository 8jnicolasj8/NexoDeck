# NexoDeck 🎛️

Botonera macro local y monitor de telemetría por LAN para Windows. Convierte cualquier celular o tablet en un Stream Deck personal con cero dependencias en la nube y privacidad absoluta.

![NexoDeck](NexoDeck-logo.png)

## ✨ Características principales

- **100% Local & Privado**: Sin cuentas, sin nube, sin telemetría ni analítica en internet. Todo el tráfico corre en tu red Wi-Fi local.
- **Conexión Segura (HTTPS/WSS)**: Autoridad de Certificación (CA) local propia con certificados SAN dinámicos para tus IPs locales. Emparejamiento por código QR de un solo uso.
- **Botonera Táctil PWA**: Interfaz moderna en React + Vite + Tailwind con respuesta háptica (`navigator.vibrate`), pulsos de luz reactivos y modo OLED negro puro.
- **Auto-Switching de Perfiles**: Detección pasiva en tiempo real (`SetWinEventHook`) del programa enfocado en Windows (VS Code, Spotify, juegos, terminal) con transiciones suaves y acento de color propio.
- **Telemetría en Vivo (4 slots)**: Monitoreo continuo de hardware con LibreHardwareMonitor (carga y temperatura de CPU/GPU, memoria RAM y velocidad de red pasiva). Alertas de temperatura (>85°C) con pulso y vibración.
- **Acciones y Multimedia**: Atajos de teclado (`hotkey`), control de volumen maestro y por aplicación (WASAPI), cambio de salidas de audio, toggles sincronizados con Windows y widget *Now Playing* (GSMTC).
- **Portapapeles Bidireccional**: Envía y recibe texto entre el celular y la PC al instante con historial de los últimos 10 elementos en memoria.
- **Scripts Seguros (.vbs)**: Ejecución de scripts locales con lista blanca estricta y protección contra path-traversal.
- **Panel de Configuración Completo**: Editor visual de grilla, creador de perfiles y botones, vinculación de procesos y exportación/importación en una ventana nativa WebView2.

### Novedades en 0.3.0
- **App Android**: el APK empaqueta el mismo cliente web y conecta por `ws://` firmado, sin instalar ninguna CA. La PWA y el iPhone siguen funcionando igual.
- **Varias PCs**: hasta cinco conexiones a la vez, una activa, con chip de PC, hoja "Mis PCs" y alertas de las PCs que no estás mirando.
- **Encendé la PC apagada**: Wake-on-LAN desde el celular (la PC necesita WoL activo en la BIOS y en el adaptador).
- **Por cable (USB)**: si el WiFi falla, la app va por ADB con `adb reverse`, y el panel instala el APK y empareja con un clic.
- **Encuentra la PC sola**: `/api/ident` + mDNS + barrido de subred cuando cambia la IP.

### Novedades en 0.2.1
- **Botonera navegable**: flechas para cambiar de página y de perfil directo desde el celular, sin abrir el panel.
- **Perfil temporal**: elegir un perfil en la botonera no lo fija; el auto-switching retoma al cambiar de app.
- **Landing con descargas**: página de presentación lista para publicar, con enlaces al último release.

### Novedades en 0.2.0
- **Editor por selectores**: cada acción se elige y configura con selectores, presets de atajos, grabador de teclas y selectores de app, proceso, dispositivo de audio, script, página y perfil. Ya no se escriben valores técnicos a mano y el estado del botón se deduce solo.
- **Botones arrastrables**: mové un botón a cualquier celda, intercambiá dos botones o soltalo sobre otra pestaña, con deshacer (`Ctrl+Z`) y soporte de teclado.
- **Logos reales**: los botones de lanzar muestran el ícono nítido de la app (incluidas apps de la Tienda y accesos `.lnk`).
- **Portapapeles como acciones**: copiar, cortar, pegar, pegar solo texto y pegar una plantilla fija desde el celular.
- **Menos RAM**: cerrar la ventana libera WebView2 por completo (0 procesos `msedgewebview2.exe`) y el servidor en reposo queda en ~9 MB.

---

## 🚀 Instalación y Uso

### Opción 1: Instalador oficial (Recomendada)
Descargá `NexoDeck-Setup-0.3.0.exe` desde la sección de lanzamientos o compilalo con el script de empaquetado.
- Configura automáticamente la tarea programada sin UAC para arrancar con Windows.
- Crea las reglas necesarias en el Firewall de Windows para red privada.
- Te permite elegir la carpeta donde se almacenan tus datos y configuraciones.

### Opción 2: Versión Portable
Descargá y descomprimí `NexoDeck-0.3.0-portable.zip` en cualquier carpeta o pendrive. Los datos se guardan en la subcarpeta local `data/`.

### Opción 3: App Android
Descargá `NexoDeck-Android.apk` desde el release, aceptá "instalar apps de esta fuente" y escaneá el QR de **Panel → Emparejar → Android (app)**. Requiere Android 8 o superior y no necesita ningún certificado. Detalles de compilación y firma en [`docs/ANDROID.md`](docs/ANDROID.md).

---

## 🛠️ Compilación desde el código fuente

### Requisitos
- Windows 10 (versión 2004+) o Windows 11
- .NET 8 SDK
- Node.js 18+ y npm
- Inno Setup 6 (opcional, para compilar el instalador `.exe`)

### Pasos de compilación rápida

Ejecutá el script de build integral:
```powershell
powershell -ExecutionPolicy Bypass -File installer/build.ps1
```

Este script compila el frontend PWA, publica el servidor .NET auto-contenido y genera tanto el archivo portable `.zip` como el instalador `NexoDeck-Setup-0.3.0.exe` en la carpeta `dist/`.

Para la app Android hace falta además JDK 17 y el Android SDK:
```bash
npm --prefix web run build:native
cd mobile && npm ci && npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

---

## 📂 Estructura del Proyecto

```
NexoDeck/
├── server/              # Backend .NET 8 (Kestrel, WASAPI, WebView2, Tray)
│   └── src/NexoDeck.Server/
├── web/                 # Frontend Móvil PWA (React, TypeScript, Vite, Tailwind)
├── mobile/              # App Android (Expo + módulo Kotlin nexodeck-net)
├── installer/           # Script Inno Setup 6 y build.ps1
├── dist/                # Binarios de distribución e instaladores
├── docs/                # Documentación técnica y arquitectura
└── landing/             # Landing page promocional (HTML estático)
```

---

## 📖 Documentación adicional

- [English Documentation (README.en.md)](README.en.md)
- [Arquitectura del Sistema (docs/ARQUITECTURA.md)](docs/ARQUITECTURA.md)
- [Protocolo WebSocket y Seguridad (docs/PROTOCOLO.md)](docs/PROTOCOLO.md)
- [Política de Seguridad (SECURITY.md)](SECURITY.md)
- [Avisos de Terceros y Licencias (THIRD-PARTY-NOTICES.md)](THIRD-PARTY-NOTICES.md)
- [Guía de Contribución (CONTRIBUTING.md)](CONTRIBUTING.md)

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Consultá el archivo [LICENSE](LICENSE) para más detalles.
