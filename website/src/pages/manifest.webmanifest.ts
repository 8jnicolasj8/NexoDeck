import type { APIRoute } from 'astro';
import { brand } from '../lib/brand';

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      {
        name: brand.name,
        short_name: brand.name,
        description: brand.tagline,
        start_url: '/',
        display: 'standalone',
        background_color: brand.bg,
        theme_color: brand.bg,
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      null,
      2,
    ),
    { headers: { 'Content-Type': 'application/manifest+json' } },
  );
