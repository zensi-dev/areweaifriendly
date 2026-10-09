import type { APIRoute } from 'astro';
import { projectMarkdown, stanceGlossary } from '../lib/markdown';
import { projects } from '../lib/projects';
import { SITE_DESCRIPTION, SITE_NAME } from '../site.config';

export const GET: APIRoute = () => {
  const body = [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    'Stances:',
    stanceGlossary(),
    '',
    ...projects.map((p) => projectMarkdown(p, 2)),
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
