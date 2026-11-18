# Auditorías Lighthouse

Medición real del build de producción (`npm run build` + `npm run preview`), con Lighthouse 12.8.2 sobre Chrome headless.

- **Fecha:** 18 de noviembre de 2026
- **URL auditada:** `http://127.0.0.1:4321/`
- **Móvil:** emulación por defecto de Lighthouse (Moto G Power, 4G lenta, CPU 4× más lenta)
- **Escritorio:** preset `desktop`

| Dispositivo | Rendimiento | Accesibilidad | Buenas prácticas | SEO | LCP |
| --- | --- | --- | --- | --- | --- |
| Móvil | 100 | 100 | 100 | 100 | 1,8 s |
| Escritorio | 100 | 100 | 100 | 100 | 0,3 s |

El LCP móvil queda por debajo del objetivo de 2,5 s. La landing no hace pedidos a terceros: fuentes, estilos, scripts e imágenes se sirven desde el mismo sitio.

## Reportes

- `home-mobile.report.json` / `home-mobile.report.html`
- `home-desktop.report.json` / `home-desktop.report.html`

Para regenerarlos:

```bash
cd website
npm run build
npm run preview
npx lighthouse@12.8.2 http://127.0.0.1:4321/ --quiet \
  --chrome-flags="--headless=new --no-sandbox --disable-gpu" \
  --output=json --output=html --output-path="lighthouse/home-mobile.report"
npx lighthouse@12.8.2 http://127.0.0.1:4321/ --preset=desktop --quiet \
  --chrome-flags="--headless=new --no-sandbox --disable-gpu" \
  --output=json --output=html --output-path="lighthouse/home-desktop.report"
```
