import type { APIRoute } from 'astro';
import { pageUrl } from '../lib/markdown';
import { lastUpdated, projects } from '../lib/projects';

export const GET: APIRoute = () =>
  Response.json({
    updated: lastUpdated(),
    projects: projects.map(({ slug, stance, ...rest }) => ({ slug, url: pageUrl(slug), stance, ...rest })),
  });
