import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

const brand = JSON.parse(readFileSync(new URL('../brand.json', import.meta.url), 'utf8'));

export default defineConfig({
  site: process.env.SITE_URL || brand.siteUrl,
  trailingSlash: 'always',
  integrations: [sitemap()],
  build: { inlineStylesheets: 'auto' },
  vite: { plugins: [tailwindcss()] },
});
