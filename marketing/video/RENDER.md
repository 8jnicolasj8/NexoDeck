# Render del video

Proyecto HyperFrames en `marketing/video/`. **Esta es la versión animática (L2):** las grabaciones reales todavía no existen y cada una se reemplaza por un marco rotulado con el nombre exacto del clip.

## Requisitos

- Node.js 22+ (probado con 24.21.0)
- FFmpeg en el PATH
- `npx hyperframes@0.8.222` (el proyecto fija esa versión)

```bash
cd marketing/video
npm install          # GSAP local
```

## Composiciones

| Archivo | Pieza | Formato | Duración |
|---|---|---|---|
| `index.html` | `promo-hero` | 1920×1080 · 30 fps | 40 s |
| `tiktok-main.html` | `tiktok-main` | 1080×1920 · 30 fps | 25 s |
| `loop-hero.html` | `loop-hero` (sin audio) | 1920×1080 · 30 fps | 9 s |

## Renderizar

```bash
cd marketing/video
npx hyperframes@0.8.222 render -c index.html        -o out/promo-hero.mp4  -q draft
npx hyperframes@0.8.222 render -c tiktok-main.html  -o out/tiktok-main.mp4 -q draft
npx hyperframes@0.8.222 render -c loop-hero.html    -o out/loop-hero.mp4   -q draft
```

Para la entrega final usar `-q delivery` (mejor calidad) y agregar audio.

## Loop para la landing

```bash
ffmpeg -i out/loop-hero.mp4 -an -c:v libx264 -crf 28 -preset slow -pix_fmt yuv420p \
  -movflags +faststart out/loop-hero-web.mp4
ffmpeg -i out/loop-hero.mp4 -an -c:v libvpx-vp9 -crf 38 -b:v 0 out/loop-hero.webm
ffmpeg -ss 0 -i out/loop-hero.mp4 -frames:v 1 out/poster-loop.jpg
```

Resultado actual: `loop-hero-web.mp4` 487 KB y `loop-hero.webm` 408 KB (objetivo ≤ 1,5 MB cada uno).

## Resultado verificado (animático)

`ffprobe` de esta sesión:

```
out/loop-hero.mp4   h264  1920×1080  30/1  9.000 s
out/promo-hero.mp4  h264  1920×1080  30/1  40.000 s
out/tiktok-main.mp4 h264  1080×1920  30/1  25.000 s
```

- `npx hyperframes check`: 0 errores, 0 warnings (solo aviso informativo de "sin audio").
- Cuadros revisados a ojo en `t=2 s` (promo), `t=6 s` (tiktok) y `t=4 s` (loop): tipografía sin cortes y marcadores legibles.
- Bucle: diferencia máxima de 40/255 entre el primer y el último cuadro; el corte no se nota.

## Integrar las grabaciones reales

1. Copiar los clips en `marketing/footage/` con los nombres de `footage/LEEME.md`.
2. En cada composición, reemplazar el `<div class="clipbox">…</div>` por:

   ```html
   <div class="clipbox" data-start="0" data-duration="8">
     <video src="../footage/01-deck-horizontal.mp4" muted playsinline></video>
   </div>
   ```

   Ajustar `data-start` / `data-duration` al momento de la escena. Para el clip de 60 fps usar `--fps 30` al renderizar.
3. Verificar que no haya datos personales en ningún cuadro.
4. Re-renderizar con `-q delivery`.

## Música y SFX

Todavía no hay audio. Al integrarlo:

- Pista CC0 o libre de derechos, tempo 100–125 BPM; registrar en `marketing/CREDITS.md`.
- Click sutil por pulsación (CC0 o sintetizado).
- Normalizar: `-af loudnorm=I=-14:TP=-1.5:LRA=11`.
- Exportar dos versiones por pieza vertical: con música y `*-nomusic.mp4`.

## Control de calidad

```bash
# Duración, resolución, fps y códec
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,duration \
  -of default=nw=1 out/promo-hero.mp4

# Cuadros en 6–8 instantes
for t in 1 6 12 18 24 30 36 39; do
  ffmpeg -v error -y -ss $t -i out/promo-hero.mp4 -frames:v 1 ".qa/promo-$t.png"
done
```

Revisar en cada cuadro: texto completo, zonas seguras de TikTok (150 px arriba, 380 px abajo, 120 px a la derecha), nada personal y bucle sin salto.
