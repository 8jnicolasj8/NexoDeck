# Publicar la landing en Netlify

Sitio estático en `website/` (Astro). La configuración vive en el `netlify.toml` de la raíz del repo (`base = "website"`, `publish = "dist"`).

## Opción A · Conectar el repositorio (recomendado)

1. Netlify → **Add new site → Import an existing project → GitHub**.
2. Elegí `8jnicolasj8/NexoDeck`.
3. Netlify lee `netlify.toml` solo: build `npm run build`, base `website`, publish `dist`, Node 22.
4. Antes de darle Deploy, elegí el nombre del sitio. Si no es `nexodeck-app`, actualizá:
   - `brand.json` → `siteUrl`
   - `website/public/robots.txt` → línea `Sitemap:`
   - Opcional: variable de entorno `SITE_URL` con el dominio final.
5. Deploy. El primer build tarda ~1 minuto.

## Opción B · Desde la CLI

```bash
npx netlify-cli login          # si no hay sesión
cd website
npm ci
npm run build
npx netlify-cli deploy --prod --dir=dist
```

Para fijar el nombre del sitio: `npx netlify-cli sites:create --name nexodeck-app` y luego `npx netlify-cli link`.

## Rebuild automático al publicar un release

1. Netlify → **Site configuration → Build & deploy → Build hooks → Add build hook**. Nombre: `release`, rama `main`.
2. Copiar la URL.
3. GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret**: nombre `NETLIFY_BUILD_HOOK`, valor la URL.
4. El workflow `.github/workflows/netlify-rebuild.yml` la llama cuando se publica un release.

Sin el secreto, el workflow no falla: avisa y termina.

## Datos del release en el sitio

En build, `src/lib/release.ts` consulta `https://api.github.com/repos/8jnicolasj8/NexoDeck/releases/latest`:

- Con `GITHUB_TOKEN` (opcional, definilo en Netlify) evita el límite de 60 requests por hora.
- Si la API falla, el build **igual termina**: usa los enlaces `releases/latest/download/<archivo>` sin versión, tamaño ni hash.

Para que las tarjetas muestren versión, tamaño y SHA-256, el release debe incluir estos assets con nombre estable:

```
NexoDeck-Setup.exe
NexoDeck-Portable.zip
NexoDeck-Android.apk
SHA256SUMS.txt
```

(`installer/build.ps1` ya genera las copias estables; el workflow de Android publica el APK y el `SHA256SUMS.txt`.)

## Verificación local

```bash
cd website
npm ci
npm run build
npm run preview     # http://localhost:4321
```

Revisar: `/`, `/en/`, `/guia-iphone/`, `/en/iphone-guide/`, `/guia-smartscreen/`, `/gracias/`, `/404.html`, `/windows` (redirección), `/apk` (redirección).

## Dominio propio (opcional, después)

Netlify → Domain management → Add a domain. Actualizar `brand.json` y `robots.txt` con el dominio final. No es necesario para lanzar.
