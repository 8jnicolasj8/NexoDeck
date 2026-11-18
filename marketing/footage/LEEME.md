# Guía de grabación

Los archivos van en esta carpeta (`marketing/footage/`) con **estos nombres exactos**. La composición los busca por nombre: si falta uno, muestra su marcador en el animático.

## Cómo grabar

### Android
```bash
scrcpy --no-audio --max-fps=60 --record=01-deck-horizontal.mp4
```
- Celular **en horizontal**, brillo al máximo, batería al 100 %.
- Modo **No molestar** activado (sin notificaciones ni llamadas).
- Perfil de demostración: sin chats, correos, nombres ni rutas personales.
- Alternativa: grabadora de pantalla del celular a 1080p/60.

### PC
- OBS o Xbox Game Bar, **1080p / 60 fps**.
- Cerrar ventanas personales, ocultar la barra de tareas si se puede.
- Usar nombres de archivo y carpetas de demo.

### Reglas para todos los clips
- **8–15 s**, empezando y terminando con ~1 s de calma.
- MP4 H.264, 1920×1080 (PC) y 1920×1080 o 1080×1920 (celular).
- Nada de datos reales: IPs, nombres de contactos, correos, rutas con tu nombre.

## Clips

| Archivo | Qué mostrar | Versión |
|---|---|---|
| `01-deck-horizontal.mp4` | Botonera 4×3 con los medidores moviéndose; tocar 3–4 botones y que se vea el pulso de luz | v0.2 |
| `02-autoswitch.mp4` | Pantalla dividida real: en la PC cambiás con Alt+Tab entre VS Code → editor de video → juego/navegador; en el celular la botonera cambia sola (sincronizar con una palmada) | v0.2 |
| `03-slider-volumen.mp4` | Deslizar el slider de volumen/Spotify y el widget "reproduciendo ahora" | v0.2 |
| `04-portapapeles.mp4` | Pegar un texto rápido desde un botón del deck en un editor | v0.2 |
| `05-panel-arrastrar.mp4` | Panel de la PC: arrastrar un botón a otra celda, ícono real de una app, vista previa del celular | v0.2 |
| `06-instalacion-qr.mp4` | Instalador → ventana de emparejar con el QR → escanear con el celular → "Conectado" | v0.2/0.3 |
| `07-modo-oled.mp4` | Activar OLED y la atenuación por inactividad | v0.2 |
| `08-varias-pcs.mp4` | Chip de PC → "Mis PCs" → cambiar entre 2 PCs y ver cómo cambia la botonera | **v0.3** |
| `09-usb.mp4` | Enchufar el cable (plano del cable + celular), ícono USB en la barra, WiFi apagado y todo sigue funcionando | **v0.3** |

Los clips 08 y 09 necesitan un release 0.3.0 instalado. Hasta entonces no se incluyen (ver `website/src/data/features.json`).

## Zonas seguras para TikTok (9:16, 1080×1920)

Dejar libres:
- **Arriba**: 150 px.
- **Abajo**: ~380 px (interfaz de la app).
- **Derecha**: ~120 px (botones).

Texto y elementos clave dentro del centro. Verificar con la plantilla de zonas seguras antes de exportar.

## Después de grabar

1. Copiar los archivos acá con el nombre exacto.
2. Avisar para integrar: la composición detecta el archivo y reemplaza el marcador.
3. Revisar el render con `ffprobe` y extraer cuadros (`marketing/video/RENDER.md`).
