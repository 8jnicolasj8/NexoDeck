# Métricas honestas, sin tracking

La landing no tiene analíticas, píxeles ni cookies. Todo lo que se puede medir es público.

## GitHub

```bash
# Estrellas, forks, issues y watchers
curl -s https://api.github.com/repos/8jnicolasj8/NexoDeck \
  | jq '{stars: .stargazers_count, forks: .forks_count, issues: .open_issues_count}'

# Descargas por asset del último release
curl -s https://api.github.com/repos/8jnicolasj8/NexoDeck/releases/latest \
  | jq '.assets[] | {name, download_count}'

# Descargas acumuladas de todos los releases (paginado)
curl -s "https://api.github.com/repos/8jnicolasj8/NexoDeck/releases?per_page=100" \
  | jq '[.[].assets[].download_count] | add'
```

Sin `jq`, usar `python -c "import json,sys; ..."`.

## Tráfico del repositorio

GitHub → repo → **Insights → Traffic**: visitas, clones y referrers de los últimos 14 días. Solo lo ve el dueño.

## Netlify

El plan gratuito muestra peticiones y ancho de banda en el panel del sitio. **No** se instala analítica de terceros: contradice la promesa de privacidad y el prompt la prohíbe.

## Qué no medir

- No hay contadores de "usuarios" ni instalaciones: no existen y no se inventan.
- No se usan UTMs con píxeles ni redirects que registren IPs.
