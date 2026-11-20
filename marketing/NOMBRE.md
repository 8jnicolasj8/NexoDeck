# Verificación del nombre «VexaDeck»

> El nombre lo eligió el usuario. Este documento **no cambia nada**: deja la lista para decidir con datos.
> No se completaron resultados para no inventar disponibilidad. Abrí cada enlace y anotá la fecha.

## ⚠️ Conflicto conocido

Existe un proyecto open source llamado **VexaDeck** (`nekename/VexaDeck`), software libre para dispositivos Stream Deck (Flathub, winget, Product Hunt). **Es otro producto**, pero el nombre es casi idéntico. Riesgos:

- SEO: las búsquedas de "VexaDeck" probablemente lleven a ese proyecto.
- Tiendas y gestores de paquetes: nombres y slugs ocupados.
- Marca: posible conflicto si el otro proyecto registra el nombre.

## Checklist

| Verificación | Enlace | Resultado | Fecha |
|---|---|---|---|
| GitHub (repos y usuarios) | https://github.com/search?q=VexaDeck&type=repositories | | |
| npm | https://www.npmjs.com/search?q=VexaDeck | | |
| winget-pkgs | https://github.com/microsoft/winget-pkgs/search?q=VexaDeck | | |
| Flathub | https://flathub.org/apps/search?q=VexaDeck | | |
| Product Hunt | https://www.producthunt.com/search?q=VexaDeck | | |
| Dominio `.com` | https://www.namecheap.com/domains/registration/results/?domain=vexadeck.com | | |
| Dominio `.ar` | https://nic.ar/ | | |
| Usuario TikTok | https://www.tiktok.com/@vexadeck | | |
| Usuario YouTube | https://www.youtube.com/@vexadeck | | |
| Usuario Instagram | https://www.instagram.com/vexadeck/ | | |
| Marca INPI (AR) | https://www.argentina.gob.ar/inpi | | |
| Marca EUIPO | https://euipo.europa.eu/eSearch/ | | |
| Marca USPTO | https://tmsearch.uspto.gov/ | | |

## Alternativas (sin verificar)

Nombres propuestos; **no** se comprobó disponibilidad. Completar con los mismos enlaces cambiando la palabra.

1. **DeckNexo** — mantiene la idea de "nexo" y se separa del proyecto existente.
2. **NexoPad** — sugiere panel/botonera; más corto para redes.
3. **PanelNexo** — descriptivo en español, bueno para búsquedas locales.

## Si se decide cambiar

1. Editar `brand.json` (`name`, `tagline`).
2. Reemplazar el nombre en `marketing/` (textos y nombres de archivo de descarga).
3. Actualizar `website/public/_redirects` y `robots.txt`.
4. Volver a compilar la landing y re-renderizar el video.
5. Renombrar el repositorio en GitHub (los enlaces viejos redirigen).
