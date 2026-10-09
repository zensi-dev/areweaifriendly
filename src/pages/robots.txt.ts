import type { APIRoute } from 'astro';
import { SITE_URL } from '../site.config';

// Everyone is welcome, AI crawlers included: being readable by agents is the point.
export const GET: APIRoute = () =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap-index.xml\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
