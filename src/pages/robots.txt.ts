import type { APIRoute } from 'astro';
import { SITE_URL } from '../site.config';

// Everyone is welcome, AI crawlers included: being readable by agents is the point.
// Content-Signal (https://contentsignals.org/) states that explicitly for training, search and AI answers.
export const GET: APIRoute = () =>
  new Response(
    `User-agent: *\nContent-Signal: ai-train=yes, search=yes, ai-input=yes\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap-index.xml\n`,
    { headers: { 'content-type': 'text/plain; charset=utf-8' } },
  );
