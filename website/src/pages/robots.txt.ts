import type { APIRoute } from 'astro';
import { brand } from '../lib/brand';

export const GET: APIRoute = ({ site }) => {
  const origin = (site?.href || brand.siteUrl).replace(/\/$/, '');
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap-index.xml\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
