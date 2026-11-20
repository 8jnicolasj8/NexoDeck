# Issues de bienvenida (`good first issue`)

Cinco tareas reales y acotadas. Crear cada una en GitHub con la etiqueta `good first issue`.

## 1. Traducir la interfaz al inglés

**Qué**: agregar un archivo de idioma `en` al cliente y un selector en el panel, sin cambiar el diseño.
**Dónde**: `web/src/client/` e `i18n.js`.
**Listo cuando**: la PWA arranca en inglés con `?lang=en` y no queda texto hardcodeado.
**Ayuda**: mandar captura en el issue antes del PR.

## 2. Íconos de aplicaciones populares

**Qué**: sumar íconos para OBS, Premiere, DaVinci, Discord, Steam y Spotify al selector del panel.
**Dónde**: `web/src/client/` (catálogo de íconos).
**Listo cuando**: aparecen en el panel con búsqueda por nombre.
**Cuidado**: usar íconos propios o de licencia libre; no copiar assets de las marcas sin permiso.

## 3. Presets de atajos por aplicación

**Qué**: crear 5 presets (VS Code, navegador, Spotify, OBS, juego) con acciones existentes.
**Dónde**: `server/src/VexaDeck.Server/wwwroot/` y el formato de configuración.
**Listo cuando**: se pueden importar desde el panel y quedan documentados en `docs/`.
**Extra**: incluir una captura del resultado.

## 4. Script para regenerar capturas de documentación

**Qué**: script que levante el cliente con datos de demo y guarde capturas en `docs/img/`.
**Dónde**: `tools/`.
**Listo cuando**: `npm run docs:captures` deja imágenes reproducibles.
**Nota**: no incluir datos personales ni IPs reales.

## 5. Guía de instalación en video (texto y tiempos)

**Qué**: escribir el guion de 60 s de `06-instalacion-qr` con pasos exactos y tiempos.
**Dónde**: `docs/ANDROID.md` o `marketing/footage/`.
**Listo cuando**: alguien puede grabar el clip siguiendo el texto sin decisiones pendientes.
