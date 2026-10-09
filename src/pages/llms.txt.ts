import type { APIRoute } from 'astro';
import { STANCE_INFO } from '../lib/labels';
import { markdownUrl, stanceGlossary } from '../lib/markdown';
import { projects } from '../lib/projects';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '../site.config';

/** https://llmstxt.org */
export const GET: APIRoute = () => {
  const body = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

Each project has an overall stance derived from its rules for AI-assisted code contributions, plus a stance on the same scale for AI-found issues and AI-written text. Every stance other than "No AI policy" is backed by a verbatim quote from the project's own policy.

Stances:
${stanceGlossary()}

## Projects

${projects.map((p) => `- [${p.name}](${markdownUrl(p.slug)}): ${STANCE_INFO[p.stance].plain}. ${p.summary}`).join('\n')}

## Data

- [All projects as JSON](${SITE_URL}/projects.json): full structured data, including quotes and sources
- [Everything in one file](${SITE_URL}/llms-full.txt): every project page as Markdown

## Optional

- [Methodology](${SITE_URL}/about/): how ratings are made and checked
`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
