# Decisiones del lanzamiento

Registro de todo lo que el prompt dejaba abierto, con el criterio usado.

## Nombre y marca

- `brand.json` es la única fuente del nombre, el lema, el repo, el sitio y la paleta. La landing lo lee en build; el video y los guiones lo repiten a mano porque son piezas estáticas (si cambia el nombre hay que buscar y reemplazar en `marketing/`).
- Se mantiene **NexoDeck** tal como pidió el usuario, con el aviso de nombre en `NOMBRE.md`.

## Landing

- **Sitio**: `https://nexodeck-app.netlify.app` como valor por defecto de `brand.json`. Si Netlify asigna otro nombre, hay que actualizar `brand.json` y `public/robots.txt` (o definir `SITE_URL` en el build).
- **Stack**: Astro 5 + Tailwind 4 con salida estática. Sin islas de JavaScript: el único script es el botón "Copiar hash", que Astro empaqueta como archivo propio.
- **Fuentes**: se reutilizan los `.woff2` de Inter y JetBrains Mono que ya viajaban con la PWA (licencia OFL), copiados a `website/public/fonts/`. Sin CDN.
- **Capturas**: no hay grabaciones ni capturas reales en el repositorio y esta sesión no tiene panel de navegador para capturar la UI. El hero usa una composición **decorativa** (no simula una captura) y la sección "Mirá cómo se ve" queda como marcador explícito. Ver `footage/LEEME.md` para grabar y reemplazar.
- **Loop del hero**: no se incluye video hasta tener `loop-hero.mp4` real; el hero se resuelve con CSS. Evita mostrar placeholders en producción.
- **Descargas**: se leen de la API de GitHub en build. Si falla, el sitio compila con enlaces `latest/download` y sin versión, fecha, tamaño ni hash.
- **Flags** (`website/src/data/features.json`): `windows` y `pwa` en `true` porque 0.2.1 está publicado. `android`, `multiPc` y `usb` en `false` porque la 0.3.0 todavía no tiene release: se muestran como "Próximamente" y el APK queda deshabilitado.
- **Guías**: la de iPhone está marcada como **sin verificar en un dispositivo real**, tal como pide el prompt. La de SmartScreen no promete que no aparezca el aviso.
- **Gracias**: existe `/gracias/` con los pasos siguientes, aunque los botones de descarga van directo a GitHub (no se puede encadenar una descarga externa con una página propia sin un proxy).
- **404**: página estática de Netlify (`/404.html`).

## Video

- Se parte del proyecto HyperFrames que ya existía en `landing/video/` y se mueve a `marketing/video/`.
- Esta entrega es la **versión animática** (L2): cada grabación se representa con un marco rotulado con el nombre exacto del clip. El render final queda para cuando el usuario deje los archivos en `marketing/footage/`.
- GSAP se instala localmente (`marketing/video/node_modules`) y se copia a `assets/gsap.min.js` para que el render no dependa de un CDN.
- Sin música definitiva: se elige una pista CC0 al integrar las grabaciones y se registra en `CREDITS.md`. No se descargó audio con licencia dudosa.

## Publicación

- No se publicó nada en redes ni foros.
- Netlify: no se pudo verificar sesión de la CLI en esta sesión; `website/DEPLOY.md` deja los pasos exactos.
- El workflow `netlify-rebuild.yml` queda listo pero **no se puede probar** hasta crear el Build Hook y guardar `NETLIFY_BUILD_HOOK` en Secrets.
