# VexaDeck para Android

La app nativa es un **shell Kotlin/Expo** que empaqueta el mismo cliente web de
la PWA dentro de un APK. Toda la red (sockets, emparejamiento, USB, mDNS,
Wake-on-LAN) vive en la capa nativa; el WebView no abre sockets.

- `applicationId` provisorio: `app.vexadeck.android` (se define una sola vez en
  `mobile/app.config.ts`).
- `minSdk 26` (Android 8.0), `targetSdk 35`.
- Protocolo v2 con mensajes firmados. No requiere instalar ninguna CA.

## Requisitos para compilar

- Node.js 20+
- JDK 17
- Android SDK (platform 35, build-tools 35) y `ANDROID_HOME` configurado
- Opcional: Inno Setup no interviene; el APK se compila aparte.

## Compilación local

```bash
# 1. Compilar el cliente web para el WebView
cd web
npm ci
npm run build:native        # genera web/dist-native/

# 2. Preparar el proyecto nativo (copia dist-native a los assets)
cd ../mobile
npm ci
npx expo prebuild --platform android

# 3. Compilar el APK
cd android
./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

Ese comando firma con la clave de depuración. Para firmar con la keystore de
release, pasá las propiedades inyectadas (las mismas que usa el CI):

```bash
./gradlew assembleRelease \
  -Pandroid.injected.signing.store.file="$KEYSTORE_PATH" \
  -Pandroid.injected.signing.store.password="$KEYSTORE_PASSWORD" \
  -Pandroid.injected.signing.key.alias=vexadeck \
  -Pandroid.injected.signing.key.password="$KEY_PASSWORD"
```

El plugin `mobile/plugins/withWebAssets.ts` copia `web/dist-native` a
`android/app/src/main/assets/web` en cada `prebuild`. Si falta la carpeta, el
prebuild falla con un mensaje claro: ejecutá `npm run build:native` primero.

`npx expo install --fix` alinea las versiones de los paquetes con la SDK de
Expo instalada (el `package.json` fija versiones exactas para builds
reproducibles).

## Keystore (obligatorio para publicar actualizaciones)

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore vexadeck-release.keystore \
  -alias vexadeck -keyalg RSA -keysize 2048 -validity 10000
```

**Guardá la keystore y sus contraseñas fuera del repositorio.** Si se pierde, no
se pueden publicar actualizaciones sobre el mismo APK: Android rechaza la firma
nueva. En CI se usan los secretos `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`.

La keystore de release 1.0.0 tiene esta huella SHA-256 (verificala con
`apksigner verify --print-certs`):

```
4E:42:F4:68:AF:6C:65:A5:E7:CA:5C:1C:FA:77:66:71:FF:98:9C:FB:81:18:57:A6:85:1D:11:80:EB:92:6D:AC
```

## Instalación por APK (sideload)

1. Descargá `VexaDeck-Android.apk` desde el release.
2. Al abrirlo, Android pide **"Permitir instalar apps de esta fuente"**.
3. Abrí VexaDeck y escaneá el QR de **Panel → Emparejar → Android (app)**.

## Permisos y por qué

| Permiso | Uso |
|---|---|
| `INTERNET` | WebSocket a la PC en la LAN |
| `ACCESS_NETWORK_STATE` / `ACCESS_WIFI_STATE` | detectar cambios de red y reconectar |
| `CHANGE_WIFI_MULTICAST_STATE` | recibir mDNS para encontrar la PC |
| `VIBRATE` | respuesta háptica y alertas |
| `CAMERA` | escanear el QR de emparejamiento (se pide al escanear) |

No hay ubicación, contactos, almacenamiento ni notificaciones.

## Tráfico en claro (ws://)

El APK permite tráfico en claro porque el protocolo v2 está autenticado y
firmado a nivel de mensaje: el secreto de emparejamiento viaja solo por el QR o
el cable, y ningún mensaje se acepta sin un MAC válido con contador
monotónico. Limitación conocida: `ws://` **no cifra** el contenido; alguien en
la misma red podría leer telemetría o texto del portapapeles, pero **no puede
ejecutar acciones ni suplantar a la PC**. Para cifrado total, usá la PWA por
HTTPS o una VPN (Tailscale/WireGuard).

## Wake-on-LAN

La app envía el magic packet desde Kotlin (`modules/vexadeck-net`) a los
broadcasts de la red local. La PC debe tener:

1. Wake-on-LAN activado en la BIOS/UEFI.
2. "Permitir que este dispositivo despierte el equipo" en las propiedades del
   adaptador de Windows.
3. Conectada por cable (WiFi rara vez soporta WoL; algunos equipos sí con
   "WoWLAN").

La MAC se recibe en el QR de emparejamiento (`mac=`) y en `/api/ident`. Sin el
QR, la app no conoce la MAC y no puede encender la PC.

## Google Play (pendiente)

No se publica todavía. Antes de hacerlo hace falta:

- Cuenta de desarrollador y nombre definitivo.
- Política de privacidad pública.
- Ficha con capturas del deck.
- Cambiar `APPLICATION_ID` en `app.config.ts` si se define otro nombre.
- Generar el AAB: `./gradlew bundleRelease`.

## Tests

`npm test` en `mobile/` corre Jest con `docs/protocol-v2-vectors.json`, el mismo
archivo que verifica el servidor C# (`VexaDeck.Server.exe --verify-v2`). Si un
lado cambia el protocolo, el otro falla en el test.
